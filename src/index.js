/**
 * 订阅转换 Cloudflare Worker
 * 基于subconverter的订阅转换代理
 */

// 配置默认后端
const DEFAULT_BACKEND = 'https://api.v1.mk';

// 允许的目标格式
const ALLOWED_TARGETS = [
  'clash', 'clashr', 'quan', 'quanx', 'loon', 'ss', 'sssub',
  'ssr', 'ssd', 'surfboard', 'v2ray',
  'surge', 'surge&ver=2', 'surge&ver=3', 'surge&ver=4'
];

// 常用配置文件列表
const COMMON_CONFIGS = [
  { name: '不使用配置', value: '' },
  { name: 'ACL4SSR 精简版', value: 'https://cdn.jsdelivr.net/gh/ACL4SSR/ACL4SSR@master/Clash/config/ACL4SSR_Mini.ini' },
  { name: 'ACL4SSR 标准版', value: 'https://cdn.jsdelivr.net/gh/ACL4SSR/ACL4SSR@master/Clash/config/ACL4SSR_Online.ini' },
  { name: 'ACL4SSR 多国家地区', value: 'https://cdn.jsdelivr.net/gh/ACL4SSR/ACL4SSR@master/Clash/config/ACL4SSR_Online_MultiCountry.ini' },
  { name: 'ACL4SSR 全分组', value: 'https://cdn.jsdelivr.net/gh/ACL4SSR/ACL4SSR@master/Clash/config/ACL4SSR_Online_Full.ini' },
  { name: 'ACL4SSR 全分组 多模式', value: 'https://cdn.jsdelivr.net/gh/ACL4SSR/ACL4SSR@master/Clash/config/ACL4SSR_Online_Full_MultiMode.ini' }
];

// 功能选项列表
const FEATURE_OPTIONS = [
  { name: 'Emoji', param: 'emoji', default: true, defaultValue: true },
  { name: 'Clash新字段名', param: 'new_name', default: true, defaultValue: true },
  { name: '启用UDP', param: 'udp', default: false, defaultValue: true },
  { name: '启用XUDP', param: 'xudp', default: false, defaultValue: true },
  { name: '启用TFO', param: 'tfo', default: false, defaultValue: true },
  { name: '基础节点排序', param: 'sort', default: false, defaultValue: true },
  { name: 'Clash.DoH', param: 'clash.doh', default: false, defaultValue: true },
  { name: 'Surge.DoH', param: 'surge.doh', default: false, defaultValue: true },
  { name: '展开规则全文', param: 'expand', default: false, defaultValue: true },
  { name: '跳过证书验证', param: 'skip_cert_verify', default: false, defaultValue: true },
  { name: '过滤不支持节点', param: 'filter_deprecated', default: false, defaultValue: true },
  { name: 'Sing-Box支持IPV6', param: 'singbox.ipv6', default: false, defaultValue: true },
  { name: '插入节点类型', param: 'append_type', default: false, defaultValue: true },
  { name: '开启TLS_1.3', param: 'tls13', default: false, defaultValue: true }
];

// Nginx默认欢迎页面
const NGINX_DEFAULT_PAGE = `<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
<style>
    body {
        width: 35em;
        margin: 0 auto;
        font-family: Tahoma, Verdana, Arial, sans-serif;
    }
</style>
</head>
<body>
<h1>Welcome to nginx!</h1>
<p>If you see this page, the nginx web server is successfully installed and
working. Further configuration is required.</p>

<p>For online documentation and support please refer to
<a href="http://nginx.org/">nginx.org</a>.<br/>
Commercial support is available at
<a href="http://nginx.com/">nginx.com</a>.</p>

<p><em>Thank you for using nginx.</em></p>
</body>
</html>`;

/**
 * 处理请求
 */
async function handleRequest(request, env) {
  // 从环境变量获取访问令牌和其他配置
  const ACCESS_TOKEN = env && env.ACCESS_TOKEN ? env.ACCESS_TOKEN : '';
  const DEFAULT_CONFIG = env && env.DEFAULT_CONFIG ? env.DEFAULT_CONFIG : '';
  const CUSTOM_BACKEND = env && env.CUSTOM_BACKEND ? env.CUSTOM_BACKEND : DEFAULT_BACKEND;
  const DEFAULT_FILENAME = env && env.DEFAULT_FILENAME ? env.DEFAULT_FILENAME : '';
  
  const url = new URL(request.url);
  const path = url.pathname;
  const params = url.searchParams;
  const token = params.get('token');
  
  // 检查路径中是否包含token
  const pathParts = path.split('/').filter(part => part);
  const pathToken = pathParts.length > 0 ? pathParts[0] : null;
  
  console.log('请求路径:', path);
  console.log('路径部分:', pathParts);
  console.log('路径令牌:', pathToken);
  console.log('查询参数:', Object.fromEntries(params.entries()));
  
  // 如果是根路径，返回Nginx默认页面
  if (path === '/' || path === '') {
    // 如果有查询参数token并且token正确，显示转换工具
    if (token && ACCESS_TOKEN && token === ACCESS_TOKEN) {
      return new Response(generateHtmlContent(ACCESS_TOKEN, env), {
        headers: {
          'Content-Type': 'text/html;charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });
    }
    // 否则显示Nginx默认页面
    return new Response(NGINX_DEFAULT_PAGE, {
      headers: {
        'Content-Type': 'text/html;charset=utf-8',
        'Server': 'nginx/1.18.0 (Ubuntu)',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  }
  
  // 如果路径是/token格式，并且token正确，显示转换工具
  if (pathToken && ACCESS_TOKEN && pathToken === ACCESS_TOKEN) {
    return new Response(generateHtmlContent(ACCESS_TOKEN, env), {
      headers: {
        'Content-Type': 'text/html;charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  }
  
  // 如果路径以token开头，后面跟着/sub，处理订阅转换请求
  if (pathParts.length >= 2 && pathParts[0] === ACCESS_TOKEN && pathParts[1] === 'sub') {
    // 获取参数
    const target = params.get('target');
    const subUrl = params.get('url');
    const config = params.get('config') || DEFAULT_CONFIG;
    const backendUrlParam = params.get('backend');
    const filename = params.get('filename') || DEFAULT_FILENAME;
    
    console.log('处理订阅请求:');
    console.log('- 目标格式:', target);
    console.log('- 订阅URL:', subUrl);
    console.log('- 配置文件:', config);
    console.log('- 后端URL:', backendUrlParam || CUSTOM_BACKEND);
    
    // 验证必要参数
    if (!target || !subUrl) {
      return new Response('缺少必要参数: target 和 url 是必须的', { status: 400 });
    }
    
    // 验证目标格式
    if (!ALLOWED_TARGETS.includes(target) && !target.startsWith('surge&ver=')) {
      return new Response('不支持的目标格式', { status: 400 });
    }
    
    // 确定后端URL
    const backendBaseUrl = backendUrlParam || CUSTOM_BACKEND;
    
    // 构建后端请求URL
    const backendUrl = new URL('/sub', backendBaseUrl);
    
    // 复制所有参数，但排除backend和token
    for (const [key, value] of params.entries()) {
      if (key !== 'backend' && key !== 'token') {
        backendUrl.searchParams.append(key, value);
      }
    }
    
    // 确保filename参数被正确添加
    if (filename) {
      console.log('添加filename参数:', filename);
      backendUrl.searchParams.set('filename', filename);
    }
    
    // 打印完整的后端请求URL
    console.log('请求后端地址:', backendUrl.toString());
    
    try {
      // 发送请求到后端
      const response = await fetch(backendUrl.toString(), {
        headers: {
          'User-Agent': request.headers.get('User-Agent') || 'SubConverter-Worker',
        },
      });
      
      // 如果后端返回错误
      if (!response.ok) {
        return new Response(`后端服务错误: ${response.status} ${response.statusText}`, { 
          status: response.status 
        });
      }
      
      // 获取响应内容
      const responseData = await response.arrayBuffer();
      
      // 获取原始响应头
      const headers = new Headers(response.headers);
      
      // 添加CORS头和缓存控制，但保留原始Content-Type
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      headers.set('Pragma', 'no-cache');
      headers.set('Expires', '0');
      
      // 创建新的响应对象，保留原始状态码和头信息
      const newResponse = new Response(responseData, {
        status: response.status,
        statusText: response.statusText,
        headers: headers
      });
      
      return newResponse;
    } catch (error) {
      return new Response(`请求处理错误: ${error.message}`, { status: 500 });
    }
  }
  
  // 处理常规的/sub请求（带token参数）
  if (path === '/sub') {
    // 获取参数
    const target = params.get('target');
    const subUrl = params.get('url');
    const config = params.get('config') || DEFAULT_CONFIG;
    const reqToken = params.get('token');
    const backendUrlParam = params.get('backend');
    const filename = params.get('filename') || DEFAULT_FILENAME;
    
    // 如果设置了访问令牌，则验证令牌
    if (ACCESS_TOKEN && reqToken !== ACCESS_TOKEN) {
      return new Response('访问令牌无效或缺失', { status: 403 });
    }
    
    // 验证必要参数
    if (!target || !subUrl) {
      return new Response('缺少必要参数: target 和 url 是必须的', { status: 400 });
    }
    
    // 验证目标格式
    if (!ALLOWED_TARGETS.includes(target) && !target.startsWith('surge&ver=')) {
      return new Response('不支持的目标格式', { status: 400 });
    }
    
    // 确定后端URL
    const backendBaseUrl = backendUrlParam || CUSTOM_BACKEND;
    
    // 构建后端请求URL
    const backendUrl = new URL('/sub', backendBaseUrl);
    
    // 复制所有参数，但排除backend和token
    for (const [key, value] of params.entries()) {
      if (key !== 'backend' && key !== 'token') {
        backendUrl.searchParams.append(key, value);
      }
    }
    
    // 确保filename参数被正确添加
    if (filename) {
      console.log('添加filename参数:', filename);
      backendUrl.searchParams.set('filename', filename);
    }
    
    // 打印完整的后端请求URL
    console.log('请求后端地址:', backendUrl.toString());
    
    try {
      // 发送请求到后端
      const response = await fetch(backendUrl.toString(), {
        headers: {
          'User-Agent': request.headers.get('User-Agent') || 'SubConverter-Worker',
        },
      });
      
      // 如果后端返回错误
      if (!response.ok) {
        return new Response(`后端服务错误: ${response.status} ${response.statusText}`, { 
          status: response.status 
        });
      }
      
      // 获取响应内容
      const responseData = await response.arrayBuffer();
      
      // 获取原始响应头
      const headers = new Headers(response.headers);
      
      // 添加CORS头和缓存控制，但保留原始Content-Type
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      headers.set('Pragma', 'no-cache');
      headers.set('Expires', '0');
      
      // 创建新的响应对象，保留原始状态码和头信息
      const newResponse = new Response(responseData, {
        status: response.status,
        statusText: response.statusText,
        headers: headers
      });
      
      return newResponse;
    } catch (error) {
      return new Response(`请求处理错误: ${error.message}`, { status: 500 });
    }
  }
  
  // 其他路径返回404，但伪装成Nginx 404页面
  return new Response('<html>\r\n<head><title>404 Not Found</title></head>\r\n<body>\r\n<center><h1>404 Not Found</h1></center>\r\n<hr><center>nginx/1.18.0 (Ubuntu)</center>\r\n</body>\r\n</html>', { 
    status: 404,
    headers: {
      'Content-Type': 'text/html',
      'Server': 'nginx/1.18.0 (Ubuntu)',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    }
  });
}

// HTML页面内容生成函数
function generateHtmlContent(accessToken, env) {
  // 从env参数获取环境变量
  const defaultConfig = env && env.DEFAULT_CONFIG ? env.DEFAULT_CONFIG : '';
  const customBackend = env && env.CUSTOM_BACKEND ? env.CUSTOM_BACKEND : DEFAULT_BACKEND;
  const defaultFilename = env && env.DEFAULT_FILENAME ? env.DEFAULT_FILENAME : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>订阅转换工具</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      padding: 10px;
      line-height: 1.5;
      background-color: #f8f9fa;
      color: #333;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background-color: #fff;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 0 15px rgba(0, 0, 0, 0.08);
    }
    h1 {
      text-align: center;
      margin-bottom: 20px;
      color: #333;
      font-weight: 600;
      font-size: 1.8rem;
    }
    .section-title {
      font-size: 1.1rem;
      font-weight: 500;
      margin-bottom: 8px;
      color: #333;
    }
    .form-label {
      font-weight: 500;
      color: #333;
      margin-bottom: 4px;
    }
    .form-text {
      color: #6c757d;
      font-size: 0.8rem;
      margin-top: 3px;
    }
    .form-control, .form-select {
      border-radius: 6px;
      border-color: #dee2e6;
      padding: 8px 12px;
      font-size: 0.95rem;
    }
    .form-control:focus, .form-select:focus {
      border-color: #80bdff;
      box-shadow: 0 0 0 0.15rem rgba(0, 123, 255, 0.25);
    }
    .btn {
      border-radius: 6px;
      padding: 8px 15px;
      font-weight: 500;
      transition: all 0.2s ease;
    }
    .btn-primary {
      background-color: #4CAF50;
      border-color: #4CAF50;
    }
    .btn-primary:hover {
      background-color: #45a049;
      border-color: #45a049;
      transform: translateY(-1px);
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    }
    .btn-secondary {
      background-color: #6c757d;
      border-color: #6c757d;
    }
    .btn-secondary:hover {
      background-color: #5a6268;
      border-color: #5a6268;
      transform: translateY(-1px);
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    }
    .btn-copy {
      background-color: #2196F3;
      border-color: #2196F3;
      color: white;
    }
    .btn-copy:hover {
      background-color: #0b7dda;
      border-color: #0b7dda;
      transform: translateY(-1px);
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    }
    .result-card {
      margin-top: 20px;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 8px;
      padding: 15px;
      background-color: #f9f9f9;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    }
    .result-url {
      word-break: break-all;
      background-color: #f1f1f1;
      padding: 10px;
      border-radius: 6px;
      margin-bottom: 15px;
      font-family: monospace;
      font-size: 0.85rem;
      border: 1px solid #e0e0e0;
    }
    .advanced-options {
      margin-top: 15px;
      padding-top: 15px;
      border-top: 1px solid #dee2e6;
    }
    .footer {
      margin-top: 20px;
      text-align: center;
      font-size: 0.8rem;
      color: #6c757d;
    }
    .options-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 12px;
    }
    .more-options-btn {
      margin-bottom: 15px;
      width: 100%;
      background-color: #f0f0f0;
      color: #333;
      border: none;
      font-weight: 500;
      padding: 6px 12px;
      font-size: 0.9rem;
    }
    .more-options-btn:hover {
      background-color: #e0e0e0;
      color: #333;
    }
    .option-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background-color: #f8f9fa;
      border-radius: 6px;
      border: 1px solid #e9ecef;
      font-size: 0.9rem;
    }
    .option-checkbox {
      margin-right: 3px;
    }
    .option-select {
      width: 70px;
      margin-left: auto;
      padding: 2px 6px;
      font-size: 0.8rem;
      border-radius: 4px;
      height: 26px;
    }
    .form-check-input {
      width: 16px;
      height: 16px;
      margin-top: 0;
    }
    .form-check-input:checked {
      background-color: #4CAF50;
      border-color: #4CAF50;
    }
    .form-section {
      margin-bottom: 15px;
      padding-bottom: 12px;
      border-bottom: 1px solid #eee;
    }
    .form-section:last-child {
      border-bottom: none;
      margin-bottom: 10px;
      padding-bottom: 5px;
    }
    .alert-info {
      background-color: #e7f3fe;
      border-color: #b6d4fe;
      color: #0a58ca;
      border-radius: 6px;
      padding: 10px 15px;
      font-size: 0.9rem;
    }
    .alert-info p {
      margin-bottom: 5px;
    }
    code {
      background-color: #f0f0f0;
      padding: 1px 4px;
      border-radius: 3px;
      color: #d63384;
      font-size: 0.85rem;
    }
    .mb-3 {
      margin-bottom: 0.8rem !important;
    }
    .mb-2 {
      margin-bottom: 0.5rem !important;
    }
    .mt-3 {
      margin-top: 0.8rem !important;
    }
    .mt-4 {
      margin-top: 1rem !important;
    }
    .mt-2 {
      margin-top: 0.5rem !important;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>订阅转换工具</h1>
    
    <div id="converter-form">
      <div class="form-section">
        <div class="section-title">订阅链接</div>
        <div class="mb-2">
          <input type="text" class="form-control" id="subUrl" placeholder="请输入原始订阅链接，多个链接请用|分隔">
        </div>
      </div>
      
      <div class="form-section">
        <div class="section-title">目标格式</div>
        <div class="mb-2">
          <select class="form-select" id="target">
            <option value="clash">Clash</option>
            <option value="clashr">ClashR</option>
            <option value="quan">Quantumult</option>
            <option value="quanx">Quantumult X</option>
            <option value="loon">Loon</option>
            <option value="ss">SS (SIP002)</option>
            <option value="sssub">SS Android</option>
            <option value="ssr">SSR</option>
            <option value="ssd">SSD</option>
            <option value="surfboard">Surfboard</option>
            <option value="surge&ver=4">Surge 4</option>
            <option value="surge&ver=3">Surge 3</option>
            <option value="surge&ver=2">Surge 2</option>
            <option value="v2ray">V2Ray</option>
          </select>
        </div>
      </div>
      
      <div class="form-section">
        <div class="section-title">配置文件</div>
        <div class="mb-2">
          <select class="form-select" id="configSelect">
            <!-- 将通过JavaScript填充 -->
          </select>
        </div>
        
        <div class="mb-2">
          <div class="section-title">自定义配置链接</div>
          <input type="text" class="form-control" id="customConfig" placeholder="可选，自定义配置文件链接">
          <div class="form-text">留空则使用环境变量中的配置或默认配置</div>
        </div>
      </div>
      
      <div class="form-section">
        <div class="section-title">后端服务地址</div>
        <div class="mb-2">
          <input type="text" class="form-control" id="backendUrl" placeholder="可选，自定义后端服务地址">
          <div class="form-text">留空则使用环境变量中的后端或默认后端</div>
        </div>
      </div>
      
      <div class="form-section">
        <div class="section-title">订阅命名:</div>
        <div class="mb-2">
          <input type="text" class="form-control" id="filename" placeholder="可选，自定义生成的配置文件名称">
          <div class="form-text">留空则使用环境变量中的命名或默认文件名</div>
        </div>
      </div>
      
      <div class="form-section">
        <div class="section-title">功能选项</div>
        <div class="small text-muted mb-2">勾选表示启用该参数，下拉框选择参数值</div>
        <div class="options-grid" id="optionsGrid">
          <!-- 将通过JavaScript填充 -->
        </div>
        
        <div class="d-grid mt-2">
          <button id="moreOptionsBtn" class="btn more-options-btn">更多选项</button>
        </div>
      </div>
      
      <div class="d-grid">
        <button id="convertBtn" class="btn btn-primary">生成订阅链接</button>
      </div>
      
      <div id="result" class="result-card" style="display: none;">
        <h5 class="mb-2">转换结果</h5>
        <div id="resultUrl" class="result-url"></div>
        <div class="d-grid">
          <button id="copyBtn" class="btn btn-copy">复制链接</button>
        </div>
  
      </div>
      
      <div class="footer">
        <p>基于 <a href="https://github.com/tindy2013/subconverter" target="_blank">subconverter</a> 提供的后端服务</p>
      </div>
    </div>
  </div>

  <script>
    // 常用配置文件列表
    const commonConfigs = ${JSON.stringify(COMMON_CONFIGS)};
    
    // 功能选项列表
    const featureOptions = ${JSON.stringify(FEATURE_OPTIONS)};
    
    // 默认后端和环境变量配置
    const defaultBackend = '${customBackend}';
    const envDefaultConfig = '${defaultConfig}';
    const envDefaultFilename = '${defaultFilename}';
    
    // 获取当前路径（用于生成链接）
    const currentPath = window.location.pathname;
    
    // 存储访问令牌
    const accessToken = '${accessToken}';
    
    // 初始化页面
    document.addEventListener('DOMContentLoaded', function() {
      // 填充配置文件下拉列表
      const configSelect = document.getElementById('configSelect');
      commonConfigs.forEach(config => {
        const option = document.createElement('option');
        option.value = config.value;
        option.textContent = config.name;
        configSelect.appendChild(option);
      });
      
      // 设置默认配置（如果存在）
      if (envDefaultConfig) {
        document.getElementById('customConfig').value = envDefaultConfig;
        document.getElementById('customConfig').placeholder = '默认: ' + envDefaultConfig;
      }
      
      // 设置默认后端
      document.getElementById('backendUrl').placeholder = '默认: ' + defaultBackend;
      
      // 设置默认文件名（如果存在）
      if (envDefaultFilename) {
        document.getElementById('filename').value = envDefaultFilename;
        document.getElementById('filename').placeholder = '默认: ' + envDefaultFilename;
      }
      
      // 填充功能选项
      const optionsGrid = document.getElementById('optionsGrid');
      
      // 初始只显示部分选项
      const initialOptions = featureOptions.slice(0, 2);
      const hiddenOptions = featureOptions.slice(2);
      let showingAllOptions = false;
      
      function renderOptions(options) {
        options.forEach(option => {
          const optionDiv = document.createElement('div');
          optionDiv.className = 'option-item';
          
          // 创建勾选框
          const checkboxDiv = document.createElement('div');
          checkboxDiv.className = 'option-checkbox';
          
          const checkbox = document.createElement('input');
          checkbox.className = 'form-check-input';
          checkbox.type = 'checkbox';
          checkbox.id = 'enable_' + option.param;
          checkbox.checked = option.default;
          
          checkboxDiv.appendChild(checkbox);
          
          // 创建标签
          const label = document.createElement('label');
          label.className = 'form-check-label';
          label.htmlFor = 'enable_' + option.param;
          label.textContent = option.name;
          
          // 创建选择框
          const select = document.createElement('select');
          select.className = 'form-select form-select-sm option-select';
          select.id = 'value_' + option.param;
          
          const optionTrue = document.createElement('option');
          optionTrue.value = 'true';
          optionTrue.textContent = 'true';
          optionTrue.selected = option.defaultValue === true;
          
          const optionFalse = document.createElement('option');
          optionFalse.value = 'false';
          optionFalse.textContent = 'false';
          optionFalse.selected = option.defaultValue === false;
          
          select.appendChild(optionTrue);
          select.appendChild(optionFalse);
          
          // 将元素添加到选项div
          optionDiv.appendChild(checkboxDiv);
          optionDiv.appendChild(label);
          optionDiv.appendChild(select);
          
          // 将选项div添加到网格
          optionsGrid.appendChild(optionDiv);
        });
      }
      
      // 渲染初始选项
      renderOptions(initialOptions);
      
      // 更多选项按钮事件
      document.getElementById('moreOptionsBtn').addEventListener('click', function() {
        if (!showingAllOptions) {
          renderOptions(hiddenOptions);
          this.textContent = '收起选项';
        } else {
          // 移除额外选项
          while (optionsGrid.children.length > initialOptions.length) {
            optionsGrid.removeChild(optionsGrid.lastChild);
          }
          this.textContent = '更多选项';
        }
        showingAllOptions = !showingAllOptions;
      });
      
      // 配置文件选择逻辑
      document.getElementById('configSelect').addEventListener('change', function() {
        const customConfigInput = document.getElementById('customConfig');
        if (this.value) {
          customConfigInput.value = this.value;
        } else {
          customConfigInput.value = '';
        }
      });
      
      // 生成订阅链接
      document.getElementById('convertBtn').addEventListener('click', function() {
        const subUrl = document.getElementById('subUrl').value.trim();
        if (!subUrl) {
          alert('请输入订阅链接');
          return;
        }
        
        const target = document.getElementById('target').value;
        const config = document.getElementById('customConfig').value.trim() || envDefaultConfig;
        const backendUrl = document.getElementById('backendUrl').value.trim() || defaultBackend;
        const filename = document.getElementById('filename').value.trim() || envDefaultFilename;
        
        // 构建转换URL - 使用新的直接路由
        let origin = window.location.origin;
        
        // 直接使用/sub路径，添加token参数
        let convertUrl = origin + '/sub?target=' + encodeURIComponent(target) + 
                         '&url=' + encodeURIComponent(subUrl) + 
                         '&token=' + encodeURIComponent(accessToken);
        
        console.log('生成的订阅URL:', convertUrl);
        
        if (config) {
          convertUrl += '&config=' + encodeURIComponent(config);
        }
        
        if (filename) {
          convertUrl += '&filename=' + encodeURIComponent(filename);
        }
        
        // 添加所有选中的功能选项
        featureOptions.forEach(option => {
          const enableCheckbox = document.getElementById('enable_' + option.param);
          if (enableCheckbox && enableCheckbox.checked) {
            const valueSelect = document.getElementById('value_' + option.param);
            const paramValue = valueSelect.value;
            convertUrl += '&' + option.param + '=' + paramValue;
          }
        });
        
        if (backendUrl !== defaultBackend) {
          convertUrl += '&backend=' + encodeURIComponent(backendUrl);
        }
        
        document.getElementById('resultUrl').textContent = convertUrl;
        document.getElementById('result').style.display = 'block';
        
        // 平滑滚动到结果区域
        document.getElementById('result').scrollIntoView({ behavior: 'smooth' });
        
        // 验证生成的URL是否包含必要参数
        if (!convertUrl.includes('target=') || !convertUrl.includes('url=')) {
          alert('警告：生成的URL缺少必要参数，请检查！');
        }
      });
      
      // 复制链接
      document.getElementById('copyBtn').addEventListener('click', function() {
        const resultUrl = document.getElementById('resultUrl').textContent;
        
        navigator.clipboard.writeText(resultUrl).then(function() {
          // 显示复制成功的提示，而不是弹窗
          const originalText = this.textContent;
          this.textContent = '复制成功!';
          this.classList.add('btn-success');
          this.classList.remove('btn-copy');
          
          setTimeout(() => {
            this.textContent = originalText;
            this.classList.remove('btn-success');
            this.classList.add('btn-copy');
          }, 2000);
        }.bind(this), function(err) {
          console.error('复制失败: ', err);
          
          // 备用复制方法
          const textarea = document.createElement('textarea');
          textarea.value = resultUrl;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
          
          const originalText = this.textContent;
          this.textContent = '复制成功!';
          this.classList.add('btn-success');
          this.classList.remove('btn-copy');
          
          setTimeout(() => {
            this.textContent = originalText;
            this.classList.remove('btn-success');
            this.classList.add('btn-copy');
          }, 2000);
        }.bind(this));
      });
    });
  </script>
</body>
</html>`;
}

/**
 * 处理OPTIONS请求
 */
function handleOptions(request) {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Server': 'nginx/1.18.0 (Ubuntu)'
    },
  });
}

/**
 * 处理所有请求
 */
export default {
  async fetch(request, env, ctx) {
    // 处理OPTIONS请求
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }
    
    // 获取URL和路径信息
    const url = new URL(request.url);
    const path = url.pathname;
    const params = url.searchParams;
    
    // 检查是否是直接的订阅请求
    // 格式: /sub?target=xxx&url=xxx&token=xxx
    if (path === '/sub' && params.has('target') && params.has('url')) {
      const ACCESS_TOKEN = env && env.ACCESS_TOKEN ? env.ACCESS_TOKEN : '';
      const DEFAULT_CONFIG = env && env.DEFAULT_CONFIG ? env.DEFAULT_CONFIG : '';
      const CUSTOM_BACKEND = env && env.CUSTOM_BACKEND ? env.CUSTOM_BACKEND : DEFAULT_BACKEND;
      const DEFAULT_FILENAME = env && env.DEFAULT_FILENAME ? env.DEFAULT_FILENAME : '';
      const reqToken = params.get('token');
      
      // 如果设置了访问令牌，则验证令牌
      if (ACCESS_TOKEN && reqToken !== ACCESS_TOKEN) {
        return new Response('访问令牌无效或缺失', { status: 403 });
      }
      
      // 获取参数
      const target = params.get('target');
      const subUrl = params.get('url');
      const config = params.get('config') || DEFAULT_CONFIG;
      const backendUrlParam = params.get('backend');
      const filename = params.get('filename') || DEFAULT_FILENAME;
      
      // 验证目标格式
      if (!ALLOWED_TARGETS.includes(target) && !target.startsWith('surge&ver=')) {
        return new Response('不支持的目标格式', { status: 400 });
      }
      
      // 确定后端URL
      const backendBaseUrl = backendUrlParam || CUSTOM_BACKEND;
      
      // 构建后端请求URL
      const backendUrl = new URL('/sub', backendBaseUrl);
      
      // 复制所有参数，但排除backend和token
      for (const [key, value] of params.entries()) {
        if (key !== 'backend' && key !== 'token') {
          backendUrl.searchParams.append(key, value);
        }
      }
      
      // 确保filename参数被正确添加
      if (filename) {
        console.log('添加filename参数:', filename);
        backendUrl.searchParams.set('filename', filename);
      }
      
      // 打印完整的后端请求URL
      console.log('请求后端地址:', backendUrl.toString());
      
      try {
        // 发送请求到后端
        const response = await fetch(backendUrl.toString(), {
          headers: {
            'User-Agent': request.headers.get('User-Agent') || 'SubConverter-Worker',
          },
        });
        
        // 如果后端返回错误
        if (!response.ok) {
          return new Response(`后端服务错误: ${response.status} ${response.statusText}`, { 
            status: response.status 
          });
        }
        
        // 获取响应内容
        const responseData = await response.arrayBuffer();
        
        // 获取原始响应头
        const headers = new Headers(response.headers);
        
        // 添加CORS头和缓存控制，但保留原始Content-Type
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        headers.set('Pragma', 'no-cache');
        headers.set('Expires', '0');
        
        // 创建新的响应对象，保留原始状态码和头信息
        const newResponse = new Response(responseData, {
          status: response.status,
          statusText: response.statusText,
          headers: headers
        });
        
        return newResponse;
      } catch (error) {
        return new Response(`请求处理错误: ${error.message}`, { status: 500 });
      }
    }
    
    // 处理GET请求
    if (request.method === 'GET') {
      return handleRequest(request, env);
    }
    
    // 其他请求方法不支持，返回伪装的Nginx错误页面
    return new Response('<html>\r\n<head><title>405 Method Not Allowed</title></head>\r\n<body>\r\n<center><h1>405 Method Not Allowed</h1></center>\r\n<hr><center>nginx/1.18.0 (Ubuntu)</center>\r\n</body>\r\n</html>', { 
      status: 405,
      headers: {
        'Content-Type': 'text/html',
        'Server': 'nginx/1.18.0 (Ubuntu)'
      }
    });
  }
}; 