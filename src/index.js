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
  { name: '插入节点类型', param: 'append_type', default: true, defaultValue: true },
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
  { name: '开启TLS_1.3', param: 'tls13', default: false, defaultValue: true }
];

// 短链接相关配置
const SHORT_URL_PREFIX = 's';  // 短链接路径前缀，例如：/s/abcdef
const SHORT_ID_LENGTH = 6;     // 短链接ID长度

/**
 * 生成随机短链接ID
 * @returns {string} 随机ID
 */
function generateShortId() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  const length = chars.length;
  for (let i = 0; i < SHORT_ID_LENGTH; i++) {
    result += chars.charAt(Math.floor(Math.random() * length));
  }
  return result;
}

/**
 * 创建短链接
 * @param {string} longUrl 原始长URL
 * @param {Object} env 环境变量
 * @returns {Promise<string>} 生成的短链接ID
 */
async function createShortUrl(longUrl, env) {
  if (!env.KV) {
    throw new Error('KV存储未配置');
  }

  // 生成短链接ID
  const shortId = generateShortId();

  // 存储到KV
  await env.KV.put(shortId, longUrl);

  return shortId;
}

/**
 * 获取短链接对应的原始URL
 * @param {string} shortId 短链接ID
 * @param {Object} env 环境变量
 * @returns {Promise<string|null>} 原始URL或null
 */
async function getLongUrl(shortId, env) {
  if (!env.KV) {
    throw new Error('KV存储未配置');
  }

  // 从KV获取原始URL
  return await env.KV.get(shortId);
}

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
      return new Response(generateHtmlContent(ACCESS_TOKEN, env, request.url), {
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
    return new Response(generateHtmlContent(ACCESS_TOKEN, env, request.url), {
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
function generateHtmlContent(accessToken, env, requestUrl) {
  // 从请求URL构建基础URL
  const baseUrl = new URL(requestUrl).origin;

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
      padding: 8px;
      line-height: 1.4;
      background-color: #f8f9fa;
      color: #333;
      font-size: 14px;
    }
    .container {
      max-width: 720px;
      margin: 0 auto;
      background-color: #fff;
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.05);
    }
    h1 {
      text-align: center;
      margin-bottom: 16px;
      color: #333;
      font-weight: 600;
      font-size: 1.5rem;
    }
    .section-title {
      font-size: 1rem;
      font-weight: 500;
      margin-bottom: 6px;
      color: #333;
    }
    .form-label {
      font-weight: 500;
      color: #333;
      margin-bottom: 4px;
      font-size: 0.9rem;
    }
    .form-text {
      color: #6c757d;
      font-size: 0.75rem;
      margin-top: 2px;
    }
    .form-control, .form-select {
      border-radius: 4px;
      border-color: #dee2e6;
      padding: 6px 10px;
      font-size: 0.9rem;
      height: 34px;
    }
    .form-control:focus, .form-select:focus {
      border-color: #80bdff;
      box-shadow: 0 0 0 0.15rem rgba(0, 123, 255, 0.25);
    }
    .btn {
      border-radius: 4px;
      padding: 6px 12px;
      font-weight: 500;
      transition: all 0.2s ease;
      font-size: 0.9rem;
      height: 34px;
    }
    .btn-group {
      display: flex;
      gap: 8px;
      margin-top: 12px;
      margin-bottom: 12px;
    }
    .btn-group .btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .result-card {
      margin-top: 16px;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 6px;
      padding: 12px;
      background-color: #f9f9f9;
    }
    .result-url {
      word-break: break-all;
      background-color: #f1f1f1;
      padding: 8px;
      border-radius: 4px;
      margin-bottom: 12px;
      font-family: monospace;
      font-size: 0.8rem;
      border: 1px solid #e0e0e0;
    }
    .short-url {
      background-color: #fff;
      border: 1px solid #e9ecef;
      padding: 12px;
      border-radius: 6px;
      margin-top: 12px;
    }
    .options-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-bottom: 10px;
    }
    .option-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      background-color: #f8f9fa;
      border-radius: 4px;
      border: 1px solid #e9ecef;
      font-size: 0.85rem;
    }
    .option-select {
      width: 65px;
      margin-left: auto;
      padding: 2px 4px;
      font-size: 0.75rem;
      border-radius: 3px;
      height: 24px;
    }
    .form-check-input {
      width: 14px;
      height: 14px;
      margin-top: 0;
    }
    .form-section {
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid #eee;
    }
    .form-section:last-child {
      border-bottom: none;
      margin-bottom: 8px;
      padding-bottom: 4px;
    }
    .more-options-btn {
      margin-bottom: 12px;
      width: 100%;
      background-color: #f0f0f0;
      color: #333;
      border: none;
      font-weight: 500;
      padding: 4px 8px;
      font-size: 0.85rem;
      height: 30px;
    }
    .footer {
      margin-top: 16px;
      text-align: center;
      font-size: 0.75rem;
      color: #6c757d;
    }
    .mb-3 {
      margin-bottom: 0.6rem !important;
    }
    .mb-2 {
      margin-bottom: 0.4rem !important;
    }
    .mt-3 {
      margin-top: 0.6rem !important;
    }
    .mt-2 {
      margin-top: 0.4rem !important;
    }
    .config-selection {
      border: 1px solid #dee2e6;
      border-radius: 6px;
      overflow: hidden;
    }
    .config-tabs {
      display: flex;
      border-bottom: 1px solid #dee2e6;
    }
    .config-tab {
      flex: 1;
      padding: 8px;
      border: none;
      background: none;
      font-size: 0.9rem;
      color: #6c757d;
      cursor: pointer;
      transition: all 0.2s;
    }
    .config-tab:first-child {
      border-right: 1px solid #dee2e6;
    }
    .config-tab.active {
      background-color: #f8f9fa;
      color: #2196f3;
      font-weight: 500;
    }
    .config-content {
      display: none;
      padding: 12px;
    }
    .config-content.active {
      display: block;
    }
    .custom-config-input {
      display: flex;
      gap: 8px;
    }
    .custom-config-input .form-control {
      flex: 1;
    }
    .custom-config-input .btn {
      padding: 4px 8px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #configPreviewModal .modal-body {
      /*max-height: 800px;*/
      /*height: 100%;*/
      max-height: 100%;
      overflow-y: auto;
    }
    #configPreviewModal pre {
      margin: 0;
      padding: 12px;
      background-color: #f8f9fa;
      border-radius: 4px;
      font-size: 0.85rem;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      display: none;
      z-index: 1040;
    }
    
    .modal {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      display: none;
      z-index: 1050;
      max-width: 90%;
      width: 800px;
    }
    
    .modal.show {
      display: block;
    }
    
    .modal-backdrop.show {
      display: block;
    }
    
    .modal-header {
      padding: 1rem;
      border-bottom: 1px solid #dee2e6;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .modal-body {
      padding: 1rem;
      max-height: 400px;
      overflow-y: auto;
    }
    
    .modal-title {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 500;
    }
    
    .btn-close {
      background: transparent;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      padding: 0.5rem;
      margin: -0.5rem;
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
        <div class="config-selection mb-3">
          <div class="config-tabs">
            <button class="config-tab active" data-type="preset">预设配置</button>
            <button class="config-tab" data-type="custom">自定义配置</button>
          </div>
          
          <div id="presetConfig" class="config-content active">
            <select class="form-select" id="configSelect">
              <!-- 将通过JavaScript填充 -->
            </select>
            <div class="form-text">选择常用的预设配置文件</div>
          </div>
          
          <div id="customConfig" class="config-content">
            <div class="custom-config-input">
              <input type="text" class="form-control" id="customConfigInput" placeholder="输入自定义配置文件链接">
              <button class="btn btn-outline-secondary btn-sm" id="previewConfigBtn" title="预览配置">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8M1.173 8a13 13 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5s3.879 1.168 5.168 2.457A13 13 0 0 1 14.828 8q-.086.13-.195.288c-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5s-3.879-1.168-5.168-2.457A13 13 0 0 1 1.172 8z"/>
                  <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0"/>
                </svg>
              </button>
            </div>
            <div class="form-text">输入完整的配置文件URL地址</div>
          </div>
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
        
        <div class="btn-group">
          <button id="copyBtn" class="btn btn-primary">复制链接</button>
          <button id="shortenBtn" class="btn btn-warning">生成短链接</button>
        </div>
        
        <div id="shortUrlContainer" class="short-url" style="display: none;">
          <div class="mb-3">
            <label for="customShortId" class="form-label">自定义短链接ID（可选）</label>
            <div class="input-group">
              <span class="input-group-text">${baseUrl}/${SHORT_URL_PREFIX}/</span>
              <input type="text" class="form-control" id="customShortId" placeholder="输入自定义ID或留空随机生成">
            </div>
            <div class="form-text">仅允许使用字母、数字和下划线，长度3-20个字符</div>
          </div>
          
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="fw-bold">短链接:</span>
            <button id="copyShortBtn" class="btn btn-sm btn-outline-secondary">复制</button>
          </div>
          <div id="shortUrl"></div>
        </div>
      </div>
      
      <div class="footer">
        <p>基于 <a href="https://github.com/tindy2013/subconverter" target="_blank">subconverter</a> 提供的后端服务</p>
      </div>
    </div>
  </div>

  <!-- 配置预览模态框 -->
  <div class="modal-backdrop" id="modalBackdrop"></div>
  <div class="modal" id="configPreviewModal">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">配置文件预览</h5>
        <button type="button" class="btn-close" id="closePreviewModal">&times;</button>
      </div>
      <div class="modal-body">
        <pre id="configPreviewContent"></pre>
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
        document.getElementById('customConfigInput').value = envDefaultConfig;
        document.getElementById('customConfigInput').placeholder = '默认: ' + envDefaultConfig;
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
      
      // 配置文件选项卡切换
      const configTabs = document.querySelectorAll('.config-tab');
      const configContents = document.querySelectorAll('.config-content');
      
      configTabs.forEach(tab => {
        tab.addEventListener('click', () => {
          // 移除所有active类
          configTabs.forEach(t => t.classList.remove('active'));
          configContents.forEach(c => c.classList.remove('active'));
          
          // 添加active类到当前选项卡
          tab.classList.add('active');
          const type = tab.dataset.type;
          document.getElementById(type + 'Config').classList.add('active');
          
          // 更新配置值
          if (type === 'preset') {
            document.getElementById('customConfigInput').value = '';
          } else {
            document.getElementById('configSelect').selectedIndex = 0;
          }
        });
      });

      // 配置文件预览功能
      const modal = document.getElementById('configPreviewModal');
      const modalBackdrop = document.getElementById('modalBackdrop');
      const closeBtn = document.getElementById('closePreviewModal');
      
      function showModal() {
        modal.classList.add('show');
        modalBackdrop.classList.add('show');
        document.body.style.overflow = 'hidden';
      }
      
      function hideModal() {
        modal.classList.remove('show');
        modalBackdrop.classList.remove('show');
        document.body.style.overflow = '';
      }
      
      // 关闭模态框的事件监听
      closeBtn.addEventListener('click', hideModal);
      modalBackdrop.addEventListener('click', hideModal);
      
      document.getElementById('previewConfigBtn').addEventListener('click', async function() {
        const configUrl = document.getElementById('customConfigInput').value.trim();
        if (!configUrl) {
          alert('请先输入配置文件链接');
          return;
        }

        try {
          const response = await fetch(configUrl);
          if (!response.ok) throw new Error('配置文件加载失败');
          const configText = await response.text();
          
          document.getElementById('configPreviewContent').textContent = configText;
          showModal();
        } catch (error) {
          alert('配置文件预览失败: ' + error.message);
        }
      });

      // 配置文件选择逻辑
      document.getElementById('configSelect').addEventListener('change', function() {
        const customConfigInput = document.getElementById('customConfigInput');
        if (this.value) {
          customConfigInput.value = this.value;
          // 切换到自定义配置选项卡
          document.querySelector('.config-tab[data-type="custom"]').click();
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
        const config = document.getElementById('customConfigInput').value.trim() || envDefaultConfig;
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
        
        // 隐藏短链接容器
        document.getElementById('shortUrlContainer').style.display = 'none';
        
        // 平滑滚动到结果区域
        document.getElementById('result').scrollIntoView({ behavior: 'smooth' });
        
        // 验证生成的URL是否包含必要参数
        if (!convertUrl.includes('target=') || !convertUrl.includes('url=')) {
          alert('警告：生成的URL缺少必要参数，请检查！');
        }
      });
      
      // 生成短链接
      document.getElementById('shortenBtn').addEventListener('click', function() {
        const longUrl = document.getElementById('resultUrl').textContent;
        const customId = document.getElementById('customShortId')?.value?.trim();
        
        if (!longUrl) {
          alert('请先生成订阅链接');
          return;
        }
        
        // 验证自定义ID格式
        if (customId && !/^[a-zA-Z0-9_]{3,20}$/.test(customId)) {
          alert('自定义ID格式不正确，请使用3-20个字母、数字或下划线');
          return;
        }
        
        // 显示按钮加载状态
        const originalText = this.textContent;
        this.textContent = '生成中...';
        this.disabled = true;
        
        // 构建API请求URL
        let apiUrl = '/api/shorten?url=' + encodeURIComponent(longUrl) + '&token=' + encodeURIComponent(accessToken);
        if (customId) {
          apiUrl += '&custom_id=' + encodeURIComponent(customId);
        }
        
        // 调用API生成短链接
        fetch(apiUrl)
          .then(response => response.json())
          .then(data => {
            if (data.error) {
              throw new Error(data.error);
            }
            
            // 显示短链接
            document.getElementById('shortUrl').textContent = data.shortUrl;
            document.getElementById('shortUrlContainer').style.display = 'block';
            
            // 恢复按钮状态
            this.textContent = originalText;
            this.disabled = false;
          })
          .catch(error => {
            alert('生成短链接失败: ' + error.message);
            console.error('生成短链接失败:', error);
            
            // 恢复按钮状态
            this.textContent = originalText;
            this.disabled = false;
          });
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
      
      // 复制短链接
      document.getElementById('copyShortBtn').addEventListener('click', function() {
        const shortUrl = document.getElementById('shortUrl').textContent;
        
        navigator.clipboard.writeText(shortUrl).then(function() {
          // 显示复制成功的提示，而不是弹窗
          const originalText = this.textContent;
          this.textContent = '已复制';
          this.classList.add('btn-success');
          this.classList.remove('btn-outline-secondary');
          
          setTimeout(() => {
            this.textContent = originalText;
            this.classList.remove('btn-success');
            this.classList.add('btn-outline-secondary');
          }, 2000);
        }.bind(this), function(err) {
          console.error('复制失败: ', err);
          
          // 备用复制方法
          const textarea = document.createElement('textarea');
          textarea.value = shortUrl;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
          
          const originalText = this.textContent;
          this.textContent = '已复制';
          this.classList.add('btn-success');
          this.classList.remove('btn-outline-secondary');
          
          setTimeout(() => {
            this.textContent = originalText;
            this.classList.remove('btn-success');
            this.classList.add('btn-outline-secondary');
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

    // 处理短链接请求 - 格式: /s/xxxxx
    const pathParts = path.split('/').filter(part => part);
    if (pathParts.length >= 2 && pathParts[0] === SHORT_URL_PREFIX) {
      const shortId = pathParts[1];

      try {
        // 获取原始URL
        const longUrl = await getLongUrl(shortId, env);

        if (!longUrl) {
          return new Response('短链接不存在或已过期', { status: 404 });
        }

        // 解析原始URL
        const originalUrl = new URL(longUrl);

        // 检查是否是本站的订阅链接
        if (originalUrl.pathname === '/sub') {
          // 构建对后端的请求
          const target = originalUrl.searchParams.get('target');
          const subUrl = originalUrl.searchParams.get('url');
          const backendUrlParam = originalUrl.searchParams.get('backend');

          // 确定后端URL
          const customBackend = env && env.CUSTOM_BACKEND ? env.CUSTOM_BACKEND : DEFAULT_BACKEND;
          const backendBaseUrl = backendUrlParam || customBackend;

          // 构建后端请求URL
          const backendUrl = new URL('/sub', backendBaseUrl);

          // 复制所有参数，但排除backend和token
          for (const [key, value] of originalUrl.searchParams.entries()) {
            if (key !== 'backend' && key !== 'token') {
              backendUrl.searchParams.append(key, value);
            }
          }

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
        } else {
          // 如果不是本站的订阅链接，直接重定向
          return Response.redirect(longUrl, 302);
        }
      } catch (error) {
        return new Response(`短链接处理错误: ${error.message}`, { status: 500 });
      }
    }

    // 处理创建短链接的API请求 - 格式: /api/shorten?url=xxx
    if (path === '/api/shorten' && params.has('url')) {
      const longUrl = params.get('url');
      const accessToken = params.get('token');
      const customId = params.get('custom_id'); // 添加自定义短链接ID支持

      // 验证令牌
      const envToken = env && env.ACCESS_TOKEN ? env.ACCESS_TOKEN : '';
      if (envToken && accessToken !== envToken) {
        return new Response(JSON.stringify({
          error: '访问令牌无效或缺失'
        }), {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      try {
        let shortId;
        if (customId) {
          // 检查自定义ID是否已存在
          const existingUrl = await getLongUrl(customId, env);
          if (existingUrl) {
            return new Response(JSON.stringify({
              error: '该自定义短链接已被使用'
            }), {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              }
            });
          }
          shortId = customId;
        } else {
          // 生成随机短链接ID
          shortId = generateShortId();
        }

        // 存储短链接
        await env.KV.put(shortId, longUrl);

        // 构建完整短链接
        const shortUrl = `${url.origin}/${SHORT_URL_PREFIX}/${shortId}`;

        // 返回JSON响应
        return new Response(JSON.stringify({
          shortUrl,
          shortId,
          originalUrl: longUrl
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          error: `创建短链接失败: ${error.message}`
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }

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
