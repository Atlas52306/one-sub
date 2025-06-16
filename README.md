# One-Sub 订阅转换工具

One-Sub 是一个基于 Cloudflare Worker 的订阅转换工具，支持多种代理订阅格式的互相转换。本项目使用 [subconverter](https://github.com/tindy2013/subconverter) 作为后端转换服务。

## 功能特点

- 支持多种订阅格式转换
- 美观的 Web 界面
- 支持自定义后端地址
- 支持自定义配置文件
- 支持访问令牌验证
- 支持多种转换参数配置

## 支持的订阅格式

- Clash
- ClashR
- Quantumult
- Quantumult X
- Loon
- SS (SIP002)
- SS Android
- SSR
- SSD
- Surfboard
- Surge (2/3/4)
- V2Ray

## Cloudflare Pages 部署指南

1. Fork 本项目到你的 GitHub 账号

2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)

3. 进入 Pages 页面，点击 "创建项目"

4. 选择 "连接到 Git"，选择你 fork 的仓库

5. 配置构建设置：
   - 构建命令：`npm run build`
   - 输出目录：`dist`

6. 环境变量设置（可选）：
   - `ACCESS_TOKEN`: 访问令牌，用于验证访问权限
   - `DEFAULT_CONFIG`: 默认配置文件链接
   - `CUSTOM_BACKEND`: 自定义后端服务地址
   - `DEFAULT_FILENAME`: 默认生成的配置文件名称

7. 点击 "保存并部署"

## 项目使用说明

### 基本使用

1. 访问你的 Cloudflare Pages 域名
2. 在订阅链接输入框中输入原始订阅地址
3. 选择目标转换格式
4. 选择配置文件（可选）
5. 配置其他参数（可选）
6. 点击 "生成订阅链接" 按钮
7. 复制生成的链接到相应的客户端中使用

### 高级功能

#### 自定义配置文件

你可以使用以下预设配置文件：
- ACL4SSR 精简版
- ACL4SSR 标准版
- ACL4SSR 多国家地区
- ACL4SSR 全分组
- ACL4SSR 全分组 多模式

也可以输入自定义配置文件链接。

#### 功能选项

支持多种功能选项配置：
- Emoji
- Clash新字段名
- 启用UDP
- 启用XUDP
- 启用TFO
- 基础节点排序
- Clash.DoH
- Surge.DoH
- 展开规则全文
- 跳过证书验证
- 过滤不支持节点
- Sing-Box支持IPV6
- 插入节点类型
- 开启TLS_1.3

### API 使用

直接订阅转换 API 格式：
```
https://你的域名/sub?target=订阅格式&url=订阅链接&token=访问令牌
```

必要参数：
- `target`: 目标格式
- `url`: 原始订阅链接
- `token`: 访问令牌（如果已设置）

可选参数：
- `config`: 配置文件链接
- `filename`: 文件名
- 其他功能参数（如 emoji=true, sort=true 等）

## 开发说明

### 本地开发

1. 克隆项目：
```bash
git clone https://github.com/你的用户名/one-sub.git
cd one-sub
```

2. 安装依赖：
```bash
npm install
```

3. 本地运行：
```bash
npm run dev
```

### 环境变量配置

在 `wrangler.toml` 文件中配置：

```toml
[vars]
ACCESS_TOKEN = "你的访问令牌"
DEFAULT_CONFIG = "配置文件链接"
CUSTOM_BACKEND = "后端服务地址"
DEFAULT_FILENAME = "config"
```

## 许可证

本项目采用 MIT 许可证，详见 [LICENSE](LICENSE) 文件。
