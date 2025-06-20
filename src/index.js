/**
 * 订阅转换 Cloudflare Worker
 * 基于subconverter的订阅转换代理
 */

// 配置默认后端
const DEFAULT_BACKEND = 'https://api.v1.mk';

// 允许的目标格式
const ALLOWED_TARGETS = [
  'auto', 'clash', 'clashr', 'quan', 'quanx', 'loon', 'mellow', 'ss', 'sssub',
  'ssr', 'ssd', 'surfboard', 'v2ray', 'trojan', 'mixed',
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

// UUID相关配置
const UUID_PREFIX = 'uuid';  // UUID路径前缀，例如：/uuid/12345678-1234-1234-1234-123456789012

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
 * 获取短链接对应的原始URL
 * @param {string} shortId 短链接ID
 * @param {Object} env 环境变量
 * @returns {Promise<string|null>} 原始URL或null
 */
async function getLongUrl(shortId, env) {
  if (!env || !env.KV) {
    throw new Error('KV存储未配置或不可用');
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
      backendUrl.searchParams.append(key, value);
      // if (key !== 'backend' && key !== 'token') {
      //   backendUrl.searchParams.append(key, value);
      // }
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>One-Sub</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
  <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
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
    .error-message {
      color: #dc3545;
      background-color: #f8d7da;
      border: 1px solid #f5c6cb;
      border-radius: 4px;
      padding: 8px 12px;
      margin-top: 8px;
      font-size: 0.85rem;
      display: none;
    }
    .info-message {
      color: #0c5460;
      background-color: #d1ecf1;
      border: 1px solid #bee5eb;
      border-radius: 4px;
      padding: 8px 12px;
      margin-top: 8px;
      font-size: 0.85rem;
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
      max-height: 90%;
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
    
    /* 新增样式 */
    .success-highlight {
      animation: highlight-fade 1.5s ease;
    }
    
    @keyframes highlight-fade {
      0% { background-color: #d4edda; }
      100% { background-color: transparent; }
    }
    
    .is-valid {
      border-color: #28a745 !important;
      background-color: #f8fff9 !important;
    }
    
    .is-invalid {
      border-color: #dc3545 !important;
      background-color: #fff8f8 !important;
    }
    
    .input-group .btn {
      z-index: 0;
    }
    
    .input-group {
      flex-wrap: nowrap;
    }
    
    .btn-warning {
      background-color: #ffc107;
      border-color: #ffc107;
      color: #212529;
    }
    
    .btn-warning:hover {
      background-color: #e0a800;
      border-color: #d39e00;
      color: #212529;
    }
    
    .btn-warning:focus, .btn-warning:active {
      box-shadow: 0 0 0 0.2rem rgba(255, 193, 7, 0.5);
    }
    
    .btn-warning:disabled {
      background-color: #ffc107;
      border-color: #ffc107;
      opacity: 0.65;
    }
    
    .loading-spinner {
      display: inline-block;
      width: 1rem;
      height: 1rem;
      margin-right: 0.5rem;
      border: 0.15em solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: spinner-border 0.75s linear infinite;
    }
    
    @keyframes spinner-border {
      to { transform: rotate(360deg); }
    }
    
    .error-message {
      display: none;
      margin-top: 0.5rem;
      padding: 0.5rem 0.75rem;
      border-radius: 0.25rem;
      font-size: 0.875rem;
      color: #721c24;
      background-color: #f8d7da;
      border: 1px solid #f5c6cb;
      animation: fadeIn 0.3s ease;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    /* 移动端优化 */
    @media (max-width: 576px) {
      body {
        padding: 0;
      }
      .container {
        max-width: 100%;
        border-radius: 0;
        padding: 12px;
      }
      .options-grid {
        grid-template-columns: 1fr !important;
      }
      .btn-group {
        flex-direction: column;
        gap: 4px !important;
      }
      .btn-group .btn {
        margin-bottom: 4px;
        width: 100%;
      }
      .input-group {
        flex-wrap: wrap;
      }
      .input-group > .input-group-text {
        width: 100%;
        border-radius: 4px 4px 0 0 !important;
        border-bottom: none;
      }
      .input-group > .form-control {
        width: 100%;
        border-radius: 0 !important;
      }
      .input-group > .btn {
        border-radius: 0 0 4px 4px !important;
        width: 100%;
      }
      /* 修复手机端短链接输入框样式 */
      #shortUrlContainer .input-group {
        display: flex;
        flex-direction: column;
      }
      #shortUrlContainer .input-group > * {
        width: 100%;
        margin-bottom: 5px;
        border-radius: 4px !important;
      }
      h1 {
        font-size: 1.3rem;
      }
      .section-title {
        font-size: 0.95rem;
      }
      .form-text {
        font-size: 0.7rem;
      }
      #qrCode img, #shortQrCode img {
        max-width: 100%;
        height: auto;
      }
    }
    
    .btn-secondary {
      background-color: #6c757d;
      border-color: #6c757d;
      color: #fff;
    }
    
    .btn-secondary:hover {
      background-color: #5a6268;
      border-color: #545b62;
      color: #fff;
    }
    
    /* 修改结果区域按钮组样式 */
    #result .btn-group {
      margin-top: 15px;
      margin-bottom: 15px;
      display: flex;
      gap: 5px;
    }
    
    #result .btn-group .btn {
      flex: 1;
      padding: 10px 15px;
      height: auto;
      font-size: 0.95rem;
    }
    
    /* 添加短链接区域样式 */
    #shortUrlContainer {
      background-color: #fff;
      border: 1px solid #e9ecef;
      border-radius: 6px;
      padding: 15px;
      margin-top: 15px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    
    /* 添加二维码区域样式 */
    #qrCodeContainer {
      text-align: center;
      margin-top: 15px;
    }
    
    #qrCode {
      display: flex;
      justify-content: center;
      margin-bottom: 15px;
    }
    
    #qrCode img {
      border: 1px solid #eee;
      padding: 10px;
      background: #fff;
    }
    
    #downloadQrBtn {
      padding: 6px 16px;
      font-size: 0.9rem;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>One-Sub</h1>
    
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
            <option value="auto">自动识别</option>
            <option value="clash">Clash</option>
            <option value="clashr">ClashR</option>
            <option value="quan">Quantumult (完整配置)</option>
            <option value="quanx">Quantumult X (完整配置)</option>
            <option value="loon">Loon</option>
            <option value="mellow">Mellow</option>
            <option value="ss">SS (SIP002)</option>
            <option value="sssub">SS (软件订阅/SIP008)</option>
            <option value="ssr">SSR</option>
            <option value="ssd">SSD</option>
            <option value="surfboard">Surfboard</option>
            <option value="surge&ver=4">Surge 4</option>
            <option value="surge&ver=3">Surge 3</option>
            <option value="surge&ver=2">Surge 2</option>
            <option value="trojan">Trojan</option>
            <option value="v2ray">V2Ray</option>
            <option value="mixed">Mixed</option>
          </select>
          <div class="form-text">选择"自动识别"将根据客户端自动选择合适的格式</div>
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
      
      <div class="form-section">
        <div class="section-title">高级过滤</div>
        <div class="d-grid mb-2">
          <button id="toggleFilterBtn" class="btn more-options-btn">显示过滤选项</button>
        </div>
        
        <div id="filterOptions" style="display: none;">
          <div class="mb-2">
            <label for="includeNodes" class="form-label">包含节点（关键词或正则）</label>
            <input type="text" class="form-control" id="includeNodes" placeholder="多个关键词用|分隔，匹配节点名">
            <div class="form-text">例如：香港|HK|Hong Kong</div>
          </div>
          
          <div class="mb-2">
            <label for="excludeNodes" class="form-label">排除节点（关键词或正则）</label>
            <input type="text" class="form-control" id="excludeNodes" placeholder="多个关键词用|分隔，匹配节点名">
            <div class="form-text">例如：官网|套餐|到期</div>
          </div>
          
          <div class="form-check mb-2">
            <input class="form-check-input" type="checkbox" id="useRegex">
            <label class="form-check-label" for="useRegex">
              使用正则表达式
            </label>
            <div class="form-text">启用后，上述过滤内容将作为正则表达式处理</div>
          </div>
          
          <div class="row">
            <div class="col-6 mb-2">
              <label for="nodeLimit" class="form-label">节点数量限制</label>
              <input type="number" class="form-control" id="nodeLimit" placeholder="节点数量上限" min="0">
            </div>
            
            <div class="col-6 mb-2">
              <label for="sortMethod" class="form-label">节点排序方式</label>
              <select class="form-select" id="sortMethod">
                <option value="">不排序</option>
                <option value="name">按名称</option>
                <option value="asc,name">按名称升序</option>
                <option value="desc,name">按名称降序</option>
              </select>
            </div>
          </div>
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
          <button id="toggleShortUrlBtn" class="btn btn-warning">创建短链接</button>
          <button id="showQrCodeBtn" class="btn btn-secondary">隐藏二维码</button>
        </div>
        
        <div id="shortUrlContainer" class="short-url" style="display: none;">
          <div class="mb-3">
            <label class="form-label fw-bold mb-2">自定义短链接ID（可选）</label>
            <div class="input-group">
              <span class="input-group-text">${baseUrl}/${SHORT_URL_PREFIX}/</span>
              <input type="text" class="form-control" id="customShortId" placeholder="输入自定义ID或留空随机生成">
              <button id="shortenBtn" class="btn btn-warning">生成短链接</button>
            </div>
            <div class="mt-2">
              <div class="form-check">
                <input class="form-check-input" type="checkbox" id="overwriteExisting">
                <label class="form-check-label" for="overwriteExisting">
                  覆盖已存在的短链接（谨慎使用）
                </label>
              </div>
            </div>
            <div class="form-text mt-1">仅允许使用字母、数字和下划线，长度3-20个字符</div>
            <div id="shortUrlError" class="error-message"></div>
          </div>
          
          <div id="shortUrlResult" style="display: none;">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="fw-bold">短链接:</span>
              <div>
                <button id="copyShortBtn" class="btn btn-sm btn-outline-secondary me-1">复制</button>
                <button id="shortQrCodeBtn" class="btn btn-sm btn-outline-success">生成二维码</button>
              </div>
            </div>
            <div id="shortUrl" class="result-url"></div>
            
            <!-- 短链接二维码容器 -->
            <div id="shortQrCodeContainer" style="text-align: center; margin-top: 15px; display: none;">
              <div id="shortQrCode" class="mb-3 d-flex justify-content-center"></div>
              <div class="text-muted small mb-3">扫描二维码可在移动设备上快速使用短链接</div>
            </div>
          </div>
        </div>
        
        <div id="qrCodeContainer" style="text-align: center; margin-top: 15px;">
          <div id="qrCode" class="mb-3 d-flex justify-content-center"></div>
          <div class="text-muted small mb-3">扫描二维码可在移动设备上快速导入配置</div>
          <div class="d-flex justify-content-center">
            <button id="downloadQrBtn" class="btn btn-outline-primary">保存二维码</button>
          </div>
        </div>
      </div>
      
      <div class="footer">
        <p>基于 <a href="https://github.com/tindy2013/subconverter" target="_blank">subconverter</a> 提供的后端服务</p>
        <p>项目地址：<a href="https://github.com/omskk/one-sub" target="_blank">https://github.com/omskk/one-sub</a></p>
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
      const initialOptions = featureOptions.slice(0, 3);
      const hiddenOptions = featureOptions.slice(3);
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
      
      // 显示/隐藏高级过滤选项
      document.getElementById('toggleFilterBtn').addEventListener('click', function() {
        const filterOptions = document.getElementById('filterOptions');
        if (filterOptions.style.display === 'none') {
          filterOptions.style.display = 'block';
          this.textContent = '隐藏过滤选项';
        } else {
          filterOptions.style.display = 'none';
          this.textContent = '显示过滤选项';
        }
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
      
      // 显示/隐藏短链接输入区域
      document.getElementById('toggleShortUrlBtn').addEventListener('click', function() {
        const shortUrlContainer = document.getElementById('shortUrlContainer');
        const shortUrlError = document.getElementById('shortUrlError');
        const qrCodeContainer = document.getElementById('qrCodeContainer');
        
        if (shortUrlContainer.style.display === 'none') {
          // 显示短链接选项
          shortUrlContainer.style.display = 'block';
          this.textContent = '隐藏短链接选项';
          this.classList.remove('btn-warning');
          this.classList.add('btn-secondary');
          
          // 确保清除之前的错误信息
          shortUrlError.style.display = 'none';
          document.getElementById('customShortId').value = '';
          
          // 隐藏二维码
          qrCodeContainer.style.display = 'none';
          
          // 恢复二维码按钮状态
          const qrCodeBtn = document.getElementById('showQrCodeBtn');
          qrCodeBtn.textContent = '显示二维码';
          qrCodeBtn.classList.remove('btn-secondary');
          qrCodeBtn.classList.add('btn-success');
        } else {
          // 隐藏短链接选项
          shortUrlContainer.style.display = 'none';
          this.textContent = '创建短链接';
          this.classList.remove('btn-secondary');
          this.classList.add('btn-warning');
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
        
        // 如果是auto格式，显示提示信息
        if (target === 'auto') {
          const infoElement = document.createElement('div');
          infoElement.className = 'info-message mt-2 mb-3';
          infoElement.innerHTML = '<strong>提示：</strong>您选择了"自动识别"格式，访问链接时系统将根据客户端自动转换为合适的格式。';
          
          // 检查是否已经添加了提示
          const existingInfo = document.querySelector('.info-message');
          if (!existingInfo) {
            const resultElement = document.getElementById('resultUrl');
            resultElement.parentNode.insertBefore(infoElement, resultElement.nextSibling);
          }
        } else {
          // 移除之前的提示（如果有）
          const existingInfo = document.querySelector('.info-message');
          if (existingInfo) {
            existingInfo.remove();
          }
        }
        
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
        
        // 添加高级过滤选项
        const includeNodes = document.getElementById('includeNodes').value.trim();
        const excludeNodes = document.getElementById('excludeNodes').value.trim();
        const useRegex = document.getElementById('useRegex').checked;
        const nodeLimit = document.getElementById('nodeLimit').value.trim();
        const sortMethod = document.getElementById('sortMethod').value;
        
        if (includeNodes) {
          convertUrl += '&include=' + encodeURIComponent(includeNodes);
          if (useRegex) convertUrl += '&include_mode=true';
        }
        
        if (excludeNodes) {
          convertUrl += '&exclude=' + encodeURIComponent(excludeNodes);
          if (useRegex) convertUrl += '&exclude_mode=true';
        }
        
        if (nodeLimit && !isNaN(parseInt(nodeLimit))) {
          convertUrl += '&limit=' + encodeURIComponent(nodeLimit);
        }
        
        if (sortMethod) {
          convertUrl += '&sort=' + encodeURIComponent(sortMethod);
        }
        
        if (backendUrl !== defaultBackend) {
          convertUrl += '&backend=' + encodeURIComponent(backendUrl);
        }
        
        document.getElementById('resultUrl').textContent = convertUrl;
        document.getElementById('result').style.display = 'block';
        
        // 重置短链接相关UI
        document.getElementById('shortUrlContainer').style.display = 'none';
        document.getElementById('toggleShortUrlBtn').textContent = '创建短链接';
        document.getElementById('toggleShortUrlBtn').classList.remove('btn-secondary');
        document.getElementById('toggleShortUrlBtn').classList.add('btn-warning');
        document.getElementById('customShortId').value = '';
        document.getElementById('shortUrlResult').style.display = 'none';
        
        // 不自动生成二维码，让用户点击"显示二维码"按钮
        document.getElementById('qrCodeContainer').style.display = 'none';
        document.getElementById('showQrCodeBtn').textContent = '显示二维码';
        document.getElementById('showQrCodeBtn').classList.remove('btn-secondary');
        document.getElementById('showQrCodeBtn').classList.add('btn-success');
        
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
        const shortUrlError = document.getElementById('shortUrlError');
        const overwriteExisting = document.getElementById('overwriteExisting').checked;
        
        // 隐藏之前的错误信息
        shortUrlError.style.display = 'none';
        shortUrlError.textContent = '';
        
        if (!longUrl) {
          shortUrlError.textContent = '请先生成订阅链接';
          shortUrlError.style.display = 'block';
          return;
        }
        
        // 验证自定义ID格式
        if (customId && !/^[a-zA-Z0-9_]{3,20}$/.test(customId)) {
          shortUrlError.textContent = '自定义ID格式不正确，请使用3-20个字母、数字或下划线';
          shortUrlError.style.display = 'block';
          return;
        }
        
        // 显示按钮加载状态
        const originalText = this.textContent;
        this.innerHTML = '<span class="loading-spinner"></span>生成中...';
        this.disabled = true;
        
        // 构建API请求URL
        let apiUrl = '/api/shorten?url=' + encodeURIComponent(longUrl) + '&token=' + encodeURIComponent(accessToken);
        if (customId) {
          apiUrl += '&custom_id=' + encodeURIComponent(customId);
        }
        if (overwriteExisting) {
          apiUrl += '&overwrite=true';
        }
        
        // 调用API生成短链接
        fetch(apiUrl)
          .then(response => response.json())
          .then(data => {
            if (data.error) {
              throw new Error(data.error);
            }
            
            // 显示短链接
            const shortUrlElement = document.getElementById('shortUrl');
            shortUrlElement.textContent = data.shortUrl;
            shortUrlElement.classList.add('success-highlight');
            document.getElementById('shortUrlResult').style.display = 'block';
            
            // 显示成功消息
            if (data.overwritten) {
              const successMsg = document.createElement('div');
              successMsg.className = 'alert alert-success mt-2';
              successMsg.innerHTML = '<strong>成功：</strong>已覆盖之前的短链接';
              
              // 先移除可能存在的成功提示
              const existingMsg = document.querySelector('#shortUrlContainer .alert');
              if (existingMsg) existingMsg.remove();
              
              // 添加新的成功提示
              document.getElementById('shortUrlError').parentNode.insertBefore(successMsg, document.getElementById('shortUrlError'));
                
              // 3秒后自动隐藏
              setTimeout(() => {
                successMsg.style.display = 'none';
              }, 3000);
            }
            
            // 如果是自定义ID，显示成功提示
            if (data.custom) {
              const customInput = document.getElementById('customShortId');
              customInput.classList.add('is-valid');
              setTimeout(() => {
                customInput.classList.remove('is-valid');
              }, 3000);
            }
            
            // 重置短链接二维码状态
            document.getElementById('shortQrCodeContainer').style.display = 'none';
            const shortQrCodeBtn = document.getElementById('shortQrCodeBtn');
            shortQrCodeBtn.textContent = '生成二维码';
            shortQrCodeBtn.classList.remove('btn-outline-secondary');
            shortQrCodeBtn.classList.add('btn-outline-success');
            
            // 确保短链接容器仍然可见
            document.getElementById('shortUrlContainer').style.display = 'block';
            
            // 修改toggleShortUrlBtn按钮状态为"隐藏短链接选项"
            const toggleBtn = document.getElementById('toggleShortUrlBtn');
            toggleBtn.textContent = '隐藏短链接选项';
            toggleBtn.classList.remove('btn-warning');
            toggleBtn.classList.add('btn-secondary');
            
            // 隐藏二维码
            document.getElementById('qrCodeContainer').style.display = 'none';
            
            // 修改showQrCodeBtn按钮状态
            const qrCodeBtn = document.getElementById('showQrCodeBtn');
            qrCodeBtn.textContent = '显示二维码';
            qrCodeBtn.classList.remove('btn-secondary');
            qrCodeBtn.classList.add('btn-success');
            
            // 恢复按钮状态
            this.innerHTML = originalText;
            this.disabled = false;
            
            // 添加样式强调显示结果
            setTimeout(() => {
              shortUrlElement.classList.remove('success-highlight');
            }, 1500);
          })
          .catch(error => {
            // 显示错误信息
            const errorMsg = error.message || '未知错误';
            let userFriendlyMsg = errorMsg;
            
            // 提供更友好的错误消息
            if (errorMsg.includes('KV存储未配置') || 
                (errorMsg.includes('Cannot read properties') && errorMsg.includes('KV'))) {
              userFriendlyMsg = '服务器未正确配置KV存储，请联系管理员';
            } else if (errorMsg.includes('该自定义短链接已被使用')) {
              userFriendlyMsg = '该自定义短链接已被使用，请尝试其他ID或勾选"覆盖已存在的短链接"';
            } else if (errorMsg.includes('existingUrl is not defined')) {
              userFriendlyMsg = '服务器内部错误，请刷新页面后重试';
            } else if (errorMsg.includes('无法生成唯一的短链接ID')) {
              userFriendlyMsg = '系统繁忙，请稍后再试';
            }
            
            // 在界面上显示错误信息
            shortUrlError.textContent = '生成短链接失败: ' + userFriendlyMsg;
            shortUrlError.style.display = 'block';
            console.error('生成短链接失败:', error);
            
            // 如果是自定义ID错误，高亮输入框
            if (customId && (errorMsg.includes('自定义') || errorMsg.includes('已被使用'))) {
              const customInput = document.getElementById('customShortId');
              customInput.classList.add('is-invalid');
              setTimeout(() => {
                customInput.classList.remove('is-invalid');
              }, 3000);
            }
            
            // 恢复按钮状态
            this.innerHTML = originalText;
            this.disabled = false;
          });
      });
      
      // 复制链接
      document.getElementById('copyBtn').addEventListener('click', function() {
        const resultUrl = document.getElementById('resultUrl').textContent;
        
        navigator.clipboard.writeText(resultUrl).then(function() {
          // 显示复制成功的提示，而不是弹窗
          const originalText = this.textContent;
          const originalClass = this.className;
          this.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="margin-right: 4px;"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg> 复制成功!';
          this.classList.add('btn-success');
          this.classList.remove('btn-primary');
          
          setTimeout(() => {
            this.innerHTML = originalText;
            this.className = originalClass;
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
          const originalClass = this.className;
          this.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="margin-right: 4px;"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg> 复制成功!';
          this.classList.add('btn-success');
          this.classList.remove('btn-primary');
          
          setTimeout(() => {
            this.innerHTML = originalText;
            this.className = originalClass;
          }, 2000);
        }.bind(this));
      });
      
      // 复制短链接
      document.getElementById('copyShortBtn').addEventListener('click', function() {
        const shortUrl = document.getElementById('shortUrl').textContent;
        
        navigator.clipboard.writeText(shortUrl).then(function() {
          // 显示复制成功的提示，而不是弹窗
          const originalText = this.textContent;
          const originalClass = this.className;
          this.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="margin-right: 4px;"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg> 已复制';
          this.classList.add('btn-success');
          this.classList.remove('btn-outline-secondary');
          
          setTimeout(() => {
            this.innerHTML = originalText;
            this.className = originalClass;
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
          const originalClass = this.className;
          this.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="margin-right: 4px;"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg> 已复制';
          this.classList.add('btn-success');
          this.classList.remove('btn-outline-secondary');
          
          setTimeout(() => {
            this.innerHTML = originalText;
            this.className = originalClass;
          }, 2000);
        }.bind(this));
      });
      
      // 生成二维码
      document.getElementById('showQrCodeBtn').addEventListener('click', function() {
        const resultUrl = document.getElementById('resultUrl').textContent;
        const qrCodeContainer = document.getElementById('qrCodeContainer');
        const qrCodeDiv = document.getElementById('qrCode');
        const shortUrlContainer = document.getElementById('shortUrlContainer');
        
        if (!resultUrl) {
          alert('请先生成订阅链接');
          return;
        }
        
        // 切换显示/隐藏
        if (qrCodeContainer.style.display === 'none') {
          // 显示二维码
          qrCodeContainer.style.display = 'block';
          
          // 更新按钮状态
          this.textContent = '隐藏二维码';
          this.classList.remove('btn-success');
          this.classList.add('btn-secondary');
          
          // 清空之前的二维码
          qrCodeDiv.innerHTML = '';
          
          try {
            // 生成二维码 - 设置适当的纠错级别以处理较长的URL
            new QRCode(qrCodeDiv, {
              text: resultUrl,
              width: Math.min(256, window.innerWidth - 80),
              height: Math.min(256, window.innerWidth - 80),
              colorDark: "#000000",
              colorLight: "#ffffff",
              correctLevel: QRCode.CorrectLevel.L, // 使用L级别以支持更多数据
              version: 10 // 较大的版本支持更长的数据
            });
          } catch (e) {
            console.error('二维码生成错误:', e);
            
            // 如果直接生成失败，尝试创建短链接，然后使用短链接生成二维码
            qrCodeDiv.innerHTML = '<div class="alert alert-warning">URL太长，无法直接生成二维码，请先创建短链接</div>';
            
            // 自动显示短链接选项
            shortUrlContainer.style.display = 'block';
            const shortUrlBtn = document.getElementById('toggleShortUrlBtn');
            shortUrlBtn.textContent = '隐藏短链接选项';
            shortUrlBtn.classList.remove('btn-warning');
            shortUrlBtn.classList.add('btn-secondary');
          }
          
          // 隐藏短链接选项
          if (qrCodeDiv.innerHTML.indexOf('alert-warning') === -1) {
            shortUrlContainer.style.display = 'none';
            
            // 恢复短链接按钮状态
            const shortUrlBtn = document.getElementById('toggleShortUrlBtn');
            shortUrlBtn.textContent = '创建短链接';
            shortUrlBtn.classList.remove('btn-secondary');
            shortUrlBtn.classList.add('btn-warning');
          }
        } else {
          // 隐藏二维码
          qrCodeContainer.style.display = 'none';
          this.textContent = '显示二维码';
          this.classList.remove('btn-secondary');
          this.classList.add('btn-success');
        }
      });
      
      // 下载二维码
      document.getElementById('downloadQrBtn').addEventListener('click', function() {
        const qrImage = document.querySelector('#qrCode img');
        if (!qrImage) {
          alert('二维码未生成');
          return;
        }
        
        // 创建临时a标签
        const link = document.createElement('a');
        link.href = qrImage.src;
        link.download = '订阅链接二维码.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
      
      // 设置默认隐藏二维码容器和短链接容器
      document.getElementById('qrCodeContainer').style.display = 'none';
      document.getElementById('shortUrlContainer').style.display = 'none';
      document.getElementById('showQrCodeBtn').textContent = '显示二维码';
      document.getElementById('showQrCodeBtn').classList.remove('btn-secondary');
      document.getElementById('showQrCodeBtn').classList.add('btn-success');

      // 为短链接生成二维码
      document.getElementById('shortQrCodeBtn').addEventListener('click', function() {
        const shortUrl = document.getElementById('shortUrl').textContent;
        const shortQrCodeContainer = document.getElementById('shortQrCodeContainer');
        const shortQrCodeDiv = document.getElementById('shortQrCode');
        
        if (!shortUrl) {
          alert('短链接未生成');
          return;
        }
        
        // 切换显示/隐藏
        if (shortQrCodeContainer.style.display === 'none') {
          // 显示二维码
          shortQrCodeContainer.style.display = 'block';
          
          // 更新按钮状态
          this.textContent = '隐藏二维码';
          this.classList.remove('btn-outline-success');
          this.classList.add('btn-outline-secondary');
          
          // 清空之前的二维码
          shortQrCodeDiv.innerHTML = '';
          
          // 生成二维码
          new QRCode(shortQrCodeDiv, {
            text: shortUrl,
            width: Math.min(200, window.innerWidth - 100),
            height: Math.min(200, window.innerWidth - 100),
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
          });
        } else {
          // 隐藏二维码
          shortQrCodeContainer.style.display = 'none';
          this.textContent = '生成二维码';
          this.classList.remove('btn-outline-secondary');
          this.classList.add('btn-outline-success');
        }
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

    // 获取用户请求中的User-Agent
    const userAgent = request.headers.get('User-Agent') || 'ClashConfigGenerator';

    // 打印请求信息到控制台（不包含敏感信息）
    console.log(`收到请求: ${path}`);

    // 处理UUID路径请求 - 格式: /uuid/xxxxx
    const pathParts = path.split('/').filter(part => part);
    if (pathParts.length > 0 && pathParts[0] === UUID_PREFIX) {
      const requestUUID = pathParts.length > 1 ? pathParts[1] : null;
      const configUUID = env.UUID || '';

      console.log(`UUID请求处理中`);

      // 如果设置了UUID，则必须验证
      if (configUUID && configUUID.trim().length > 0) {
        // 如果路径为空或不匹配配置的UUID，拒绝访问
        if (!requestUUID || requestUUID !== configUUID) {
          console.log(`UUID验证失败`);
          return new Response('未授权访问', {
            status: 403,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        }

        // 如果路径超过了两段（UUID后面还有额外的路径部分），也禁止访问
        if (pathParts.length > 2) {
          console.log(`无效的UUID访问路径`);
          return new Response('无效的访问路径', {
            status: 403,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        }
      } else {
        // 如果没有设置UUID，不允许使用UUID路径
        console.log(`UUID未配置`);
        return new Response('未配置UUID，请联系管理员', {
          status: 403,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }

      try {
        console.log(`开始处理订阅合并请求`);
        // 解析传入的订阅链接
        const providerConfigs = parseProviders(env);
        if (!providerConfigs || providerConfigs.length === 0) {
          console.log(`无有效订阅提供者配置`);
          return new Response('未配置有效的订阅链接，请在环境变量中设置。', {
            status: 400,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        }

        console.log(`找到 ${providerConfigs.length} 个订阅提供者`);
        // 获取所有订阅内容
        const subscriptions = await fetchSubscriptions(providerConfigs, userAgent);

        // 生成配置
        console.log(`开始生成合并配置`);
        const config = generateConfig(providerConfigs, subscriptions);
        console.log(`配置生成完成，准备返回`);

        // 返回YAML格式的配置，设置响应头防止缓存
        return new Response(config, {
          headers: {
            'Content-Type': 'text/yaml; charset=utf-8',
            'Content-Disposition': 'attachment; filename=clash-config.yaml',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
          }
        });
      } catch (error) {
        console.error(`配置生成错误:`, error);
        return new Response(`配置生成错误: ${error.message}`, {
          status: 500,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    }

    // 处理短链接请求 - 格式: /s/xxxxx
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
      const overwrite = params.get('overwrite') === 'true'; // 是否覆盖已存在的短链接

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

      // 验证KV存储是否可用
      if (!env || !env.KV) {
        return new Response(JSON.stringify({
          error: 'KV存储未配置，请联系管理员配置Workers KV存储'
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // 验证自定义ID格式
      if (customId && !/^[a-zA-Z0-9_]{3,20}$/.test(customId)) {
        return new Response(JSON.stringify({
          error: '自定义ID格式不正确，请使用3-20个字母、数字或下划线'
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      try {
        let shortId;
        let existingUrl = null;  // 初始化existingUrl变量

        if (customId) {
          // 检查自定义ID是否已存在
          existingUrl = await getLongUrl(customId, env);
          if (existingUrl && !overwrite) {
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

          // 确保随机生成的ID不会与已有ID冲突
          let attempts = 0;
          while (attempts < 5) {  // 最多尝试5次
            existingUrl = await getLongUrl(shortId, env);
            if (!existingUrl) break;  // 如果ID不存在，跳出循环

            // 重新生成ID
            shortId = generateShortId();
            attempts++;
          }

          if (attempts >= 5) {
            return new Response(JSON.stringify({
              error: '无法生成唯一的短链接ID，请稍后再试'
            }), {
              status: 500,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              }
            });
          }
        }

        // 存储短链接
        await env.KV.put(shortId, longUrl);

        // 构建完整短链接
        const shortUrl = `${url.origin}/${SHORT_URL_PREFIX}/${shortId}`;

        // 返回JSON响应
        return new Response(JSON.stringify({
          shortUrl,
          shortId,
          originalUrl: longUrl,
          custom: !!customId,
          overwritten: customId && existingUrl && overwrite
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      } catch (error) {
        console.error('创建短链接错误:', error);

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

/**
 * 从环境变量中解析订阅提供者
 * @param {Object} env 环境变量
 * @returns {Array} 订阅提供者数组
 */
function parseProviders(env) {
  const providers = [];

  // 遍历环境变量，查找以PROVIDER_开头的变量
  for (const key in env) {
    if (key.startsWith('PROVIDER_')) {
      try {
        const value = env[key];
        if (!value || typeof value !== 'string') continue;

        // 尝试解析格式: "名称,订阅链接"
        const parts = value.split(',');
        if (parts.length < 2) continue;

        const name = parts[0].trim();
        const url = parts[1].trim();

        if (name && url) {
          providers.push({ name, url });
          console.log(`加载订阅提供者: ${name}`);
        }
      } catch (error) {
        console.error(`处理环境变量 ${key} 时出错:`, error);
      }
    }
  }

  return providers;
}

/**
 * 获取订阅内容
 * @param {Array} providers 订阅提供者数组
 * @param {string} userAgent 用户代理
 * @returns {Promise<Object>} 订阅内容对象
 */
async function fetchSubscriptions(providers, userAgent) {
  const subscriptions = {};

  // 并行获取所有订阅内容
  const fetchPromises = providers.map(async (provider) => {
    try {
      // 添加时间戳或随机字符串，确保绕过缓存
      const noCache = Date.now();
      let url = provider.url;

      // 添加防缓存参数
      url += url.includes('?') ? `&_=${noCache}` : `?_=${noCache}`;

      console.log(`开始获取订阅: ${provider.name}`);

      const response = await fetch(url, {
        headers: {
          'User-Agent': userAgent,
          'Accept': '*/*',
          'Cache-Control': 'no-cache, no-store',
          'Pragma': 'no-cache'
        },
        cf: {
          // 禁用Cloudflare缓存
          cacheTtl: 0,
          cacheEverything: false
        }
      });

      if (!response.ok) {
        throw new Error(`获取订阅失败: ${response.status} ${response.statusText}`);
      }

      // 存储订阅内容
      const text = await response.text();
      subscriptions[provider.name] = text;
      console.log(`成功获取订阅: ${provider.name} | 内容长度: ${text.length}字节`);
    } catch (error) {
      console.error(`获取订阅 ${provider.name} 时出错:`, error);
      subscriptions[provider.name] = null; // 标记获取失败
    }
  });

  // 等待所有请求完成
  await Promise.all(fetchPromises);

  return subscriptions;
}

/**
 * 生成完整的Clash配置
 * @param {Array} providers 订阅提供者数组
 * @param {Object} subscriptions 订阅内容对象
 * @returns {string} Clash配置
 */
function generateConfig(providers, subscriptions) {
  // 构建代理提供者配置
  const proxyProviders = {};
  const proxyGroups = [];

  // 添加默认节点
  const baseProxies = [
    {
      name: "🔄 直连",
      type: "direct",
      udp: true
    },
    {
      name: "❌ 拒绝",
      type: "reject"
    }
  ];

  // 为每个提供者创建配置 - 使用Map提高速度
  const providerGroupNames = [];
  providers.forEach(provider => {
    const providerKey = provider.name.replace(/\s+/g, '');

    // 添加到proxy-providers
    proxyProviders[providerKey] = {
      url: provider.url,
      type: "http",
      interval: 43200,
      "health-check": {
        enable: true,
        url: "https://www.gstatic.com/generate_204",
        interval: 300
      },
      override: {
        "additional-prefix": `${providerKey}-`
      }
    };

    // 为提供者创建一个分组
    proxyGroups.push({
      name: `📑 ${provider.name}`,
      type: "url-test",
      tolerance: 10,
      interval: 1200,
      "include-all": true,
      "exclude-type": "direct|reject",
      filter: `(?i)${providerKey}-`
    });

    // 收集提供商组名称
    providerGroupNames.push(`📑 ${provider.name}`);
  });

  // 添加默认分组
  const defaultGroup = {
    name: "🚀 默认",
    type: "select",
    proxies: [
      "⚡️ 自动选择",
      "📍 全部节点",
      ...providerGroupNames,
      "🔄 直连",
      "🇭🇰 香港",
      "🇹🇼 台湾",
      "🇯🇵 日本",
      "🇸🇬 新加坡",
      "🇺🇸 美国",
      "🌐 其它地区"
    ]
  };

  // 将默认分组放在最前面
  proxyGroups.unshift(defaultGroup);

  // 创建标准分组配置并添加到分组列表末尾
  const standardGroups = createStandardGroups(providerGroupNames);
  // 删除standardGroups中的"🚀 默认"组，因为我们已经单独添加
  const filteredStandardGroups = standardGroups.filter(group => group.name !== "🚀 默认");
  proxyGroups.push(...filteredStandardGroups);

  // 使用StringBuilder模式构建YAML字符串，提高性能
  // 手动构建YAML字符串，避免格式问题
  const yamlParts = [];

  // 基础代理部分
  let baseProxiesYaml = '';
  for (const proxy of baseProxies) {
    baseProxiesYaml += `- name: ${proxy.name}\n  type: ${proxy.type}\n`;
    if (proxy.udp) {
      baseProxiesYaml += `  udp: ${proxy.udp}\n`;
    }
  }

  // 手动构建proxy-providers部分
  let proxyProvidersYaml = '';
  for (const [key, provider] of Object.entries(proxyProviders)) {
    proxyProvidersYaml += `  ${key}:\n`;
    proxyProvidersYaml += `    url: "${provider.url}"\n`;
    proxyProvidersYaml += `    type: ${provider.type}\n`;
    proxyProvidersYaml += `    interval: ${provider.interval}\n`;
    proxyProvidersYaml += `    health-check:\n`;
    proxyProvidersYaml += `      enable: ${provider["health-check"].enable}\n`;
    proxyProvidersYaml += `      url: "${provider["health-check"].url}"\n`;
    proxyProvidersYaml += `      interval: ${provider["health-check"].interval}\n`;
    proxyProvidersYaml += `    override:\n`;
    proxyProvidersYaml += `      additional-prefix: "${provider.override["additional-prefix"]}"\n`;
  }

  // 手动构建proxy-groups部分，性能优化
  const groupParts = [];
  for (const group of proxyGroups) {
    const groupPart = [];
    groupPart.push(`- name: "${group.name}"\n  type: ${group.type}\n`);

    if (group.proxies) {
      groupPart.push(`  proxies:\n`);
      for (const proxy of group.proxies) {
        groupPart.push(`    - ${proxy}\n`);
      }
    }

    if (group["include-all"] !== undefined) {
      groupPart.push(`  include-all: ${group["include-all"]}\n`);
    }

    if (group["exclude-type"]) {
      groupPart.push(`  exclude-type: "${group["exclude-type"]}"\n`);
    }

    if (group.filter) {
      groupPart.push(`  filter: "${group.filter}"\n`);
    }

    if (group.tolerance) {
      groupPart.push(`  tolerance: ${group.tolerance}\n`);
    }

    if (group.interval) {
      groupPart.push(`  interval: ${group.interval}\n`);
    }
    groupParts.push(groupPart.join(''));
  }
  let proxyGroupsYaml = groupParts.join('');

  // 组装完整配置模板
  yamlParts.push(`# 通过Cloudflare Worker自动生成的Clash配置
# 生成时间: ${new Date().toISOString()}
mixed-port: 7890

profile:
  store-selected: true
  store-fake-ip: true

geodata-mode: true
geodata-loader: standard
geo-auto-update: true
geo-update-interval: 24
geox-url:
  geoip: "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip-lite.dat"
  geosite: "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geosite.dat"
  mmdb: "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/country-lite.mmdb"
  asn: "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/GeoLite2-ASN.mmdb"


proxies:
${baseProxiesYaml}
proxy-providers:
${proxyProvidersYaml}
proxy-groups:
${proxyGroupsYaml}
rules:
- GEOSITE,category-ads-all,🛑 广告拦截
- "GEOIP,lan,🔄 直连,no-resolve"
- GEOSITE,github,📦 Github
- GEOSITE,twitter,🐦 Twitter
- GEOSITE,youtube,📹 YouTube
- GEOSITE,google,🔍 Google
- GEOSITE,telegram,📱 Telegram
- GEOSITE,netflix,🎬 NETFLIX
- GEOSITE,bilibili,📺 哔哩哔哩
- GEOSITE,spotify,🎵 Spotify
- GEOSITE,CN,🌏 国内
- MATCH,🌍 其他
`);

  return yamlParts.join('');
}

/**
 * 创建标准分组配置
 * @param {Array} providerGroupNames 提供者组名称数组
 * @returns {Array} 标准分组配置数组
 */
function createStandardGroups(providerGroupNames) {
  return [
    {
      name: "📍 全部节点",
      type: "select",
      "include-all": true,
      "exclude-type": "direct|reject"
    },
    {
      name: "⚡️ 自动选择",
      type: "url-test",
      "include-all": true,
      "exclude-type": "direct|reject",
      tolerance: 10,
      interval: 1200
    },
    {
      name: "🛑 广告拦截",
      type: "select",
      proxies: [
        "❌ 拒绝",
        "🔄 直连",
        "🚀 默认"
      ]
    },
    {
      name: "🇭🇰 香港",
      type: "select",
      "include-all": true,
      "exclude-type": "direct|reject",
      filter: "(?i)港|hk|hongkong|hong kong"
    },
    {
      name: "🇹🇼 台湾",
      type: "select",
      "include-all": true,
      "exclude-type": "direct|reject",
      filter: "(?i)台|tw|taiwan"
    },
    {
      name: "🇯🇵 日本",
      type: "select",
      "include-all": true,
      "exclude-type": "direct|reject",
      filter: "(?i)日|jp|japan"
    },
    {
      name: "🇺🇸 美国",
      type: "select",
      "include-all": true,
      "exclude-type": "direct|reject",
      filter: "(?i)美|us|unitedstates|united states"
    },
    {
      name: "🇸🇬 新加坡",
      type: "select",
      "include-all": true,
      "exclude-type": "direct|reject",
      filter: "(?i)(新|sg|singapore)"
    },
    {
      name: "🔍 Google",
      type: "select",
      proxies: [
        "🚀 默认",
        "🇭🇰 香港",
        "🇹🇼 台湾",
        "🇯🇵 日本",
        "🇸🇬 新加坡",
        "🇺🇸 美国",
        "🌐 其它地区",
        "📍 全部节点",
        "⚡️ 自动选择",
        "🔄 直连"
      ]
    },
    {
      name: "📱 Telegram",
      type: "select",
      proxies: [
        "🚀 默认",
        "🇭🇰 香港",
        "🇹🇼 台湾",
        "🇯🇵 日本",
        "🇸🇬 新加坡",
        "🇺🇸 美国",
        "🌐 其它地区",
        "📍 全部节点",
        "⚡️ 自动选择",
        "🔄 直连"
      ]
    },
    {
      name: "🐦 Twitter",
      type: "select",
      proxies: [
        "🚀 默认",
        "🇭🇰 香港",
        "🇹🇼 台湾",
        "🇯🇵 日本",
        "🇸🇬 新加坡",
        "🇺🇸 美国",
        "🌐 其它地区",
        "📍 全部节点",
        "⚡️ 自动选择",
        "🔄 直连"
      ]
    },
    {
      name: "📺 哔哩哔哩",
      type: "select",
      proxies: [
        "🔄 直连",
        "🚀 默认",
        "🇭🇰 香港",
        "🇹🇼 台湾",
        "🇯🇵 日本",
        "🇸🇬 新加坡",
        "🇺🇸 美国",
        "🌐 其它地区",
        "📍 全部节点",
        "⚡️ 自动选择"
      ]
    },
    {
      name: "📹 YouTube",
      type: "select",
      proxies: [
        "🚀 默认",
        "🇭🇰 香港",
        "🇹🇼 台湾",
        "🇯🇵 日本",
        "🇸🇬 新加坡",
        "🇺🇸 美国",
        "🌐 其它地区",
        "📍 全部节点",
        "⚡️ 自动选择",
        "🔄 直连"
      ]
    },
    {
      name: "🎬 NETFLIX",
      type: "select",
      proxies: [
        "🚀 默认",
        "🇭🇰 香港",
        "🇹🇼 台湾",
        "🇯🇵 日本",
        "🇸🇬 新加坡",
        "🇺🇸 美国",
        "🌐 其它地区",
        "📍 全部节点",
        "⚡️ 自动选择",
        "🔄 直连"
      ]
    },
    {
      name: "🎵 Spotify",
      type: "select",
      proxies: [
        "🚀 默认",
        "🇭🇰 香港",
        "🇹🇼 台湾",
        "🇯🇵 日本",
        "🇸🇬 新加坡",
        "🇺🇸 美国",
        "🌐 其它地区",
        "📍 全部节点",
        "⚡️ 自动选择",
        "🔄 直连"
      ]
    },
    {
      name: "📦 Github",
      type: "select",
      proxies: [
        "🚀 默认",
        "🇭🇰 香港",
        "🇹🇼 台湾",
        "🇯🇵 日本",
        "🇸🇬 新加坡",
        "🇺🇸 美国",
        "🌐 其它地区",
        "📍 全部节点",
        "⚡️ 自动选择",
        "🔄 直连"
      ]
    },
    {
      name: "🌏 国内",
      type: "select",
      proxies: [
        "🔄 直连",
        "🚀 默认",
        "🇭🇰 香港",
        "🇹🇼 台湾",
        "🇯🇵 日本",
        "🇸🇬 新加坡",
        "🇺🇸 美国",
        "🌐 其它地区",
        "📍 全部节点",
        "⚡️ 自动选择"
      ]
    },
    {
      name: "🌍 其他",
      type: "select",
      proxies: [
        "🚀 默认",
        "🇭🇰 香港",
        "🇹🇼 台湾",
        "🇯🇵 日本",
        "🇸🇬 新加坡",
        "🇺🇸 美国",
        "🌐 其它地区",
        "📍 全部节点",
        "⚡️ 自动选择",
        "🔄 直连"
      ]
    },
    {
      name: "🌐 其它地区",
      type: "select",
      "include-all": true,
      "exclude-type": "direct|reject",
      filter: "(?i)^(?!.*(?:🇭🇰|🇯🇵|🇺🇸|🇸🇬|🇹🇼|港|hk|hongkong|台|tw|taiwan|日|jp|japan|新|sg|singapore|美|us|unitedstates)).*"
    }
  ];
}
