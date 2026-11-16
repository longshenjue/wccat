# ShareEn 视觉取景、固定尺寸处理与缓存

用户已确认：分享卡1200×1500；原图与新闻标题交给现有deepseek-flash进行视觉理解，返回主体保护和取景建议；程序负责精确裁切/缩放，不重绘新闻人物；无法安全裁切时切换分栏。每天仅处理2～3张海外焦点图，下载不调用AI，支持单张重处理。本次不自动commit/push，保留当前未提交的Logo/栏目/日期三行和去除榜单横线改动。

## 尺寸与保护
- 通栏成品固定1072×360；紧凑模式不得另换宽高比。
- 分栏成品400×480，完整适配原图；显示时可去掉程序生成的适配空边（额外保留2px安全边），不裁原图内容。图片左侧、事件说明右侧，网格按实际图宽高分配空间，情绪条和相关性仍通栏。图片失败/隐藏时整块收起，事件说明恢复全宽。
- 模型输出mode(wide/split)、protectedRegions归一化矩形、focalPoint、confidence及短reason。要求保护所有人脸、奖杯/产品和关键文字，不伪造实际照片内容。
- 程序独立验证坐标、留安全边距，只有可容纳全部保护范围才裁切；低置信度、无效/不可行建议、无法充分放大时降级为完整分栏。不给模型生成背景或改脸。
- 维持固定卡尺寸及实际正文溢出检查。管理员隐藏图片和紧凑英文态度条继续可用。

## 获取与处理
- 复用图片URL白名单，每次重定向重新验证；限制下载6MiB、解码12百万像素、超时10秒，JPEG/PNG/WebP/GIF首帧，EXIF校正后分析/裁切。原图不写日志。
- 视觉输入使用经校验原图的等比缩小版（最长1280，JPEG），以base64发给DeepSeek Chat Completions；同一图片最多一次视觉请求，超时30秒。失败不重绘/无限重试，记录短日志并使用安全分栏。
- sharp使用项目当前已有0.34.5，声明为直接依赖，不升级整套依赖。输出WebP，单图上限512KiB。

## 持久化与归档
- 每个highlight可选imageAsset：版本、内容id、requestKey、sourceUrl/sourceHash、model、policyVersion、layout、width/height、sourceWidth/sourceHeight、crop、protectedRegions、confidence、reason、processedAt、mime、dataBase64。
- id为成品字节SHA256；requestKey包含原图hash、URL、新闻标题、模型、处理规则与目标尺寸。缓存命中无需再调用AI；显式force重处理可重读原图与视觉请求。
- dataBase64仅服务器保存，随daily_reports.payload自然进入SQLite归档，避免跨部署丢失配图。不新增外部存储或不受控图片目录。
- 管理员GET/保存响应剔除dataBase64，用已认证的图片GET按日期/topicId/assetId读取持久数据；公开daily仍不发送ShareEn。图片GET只读、无AI、无网络处理。
- 编辑保存只接受同版本服务器已有图片，恢复其私有字节；替换来源URL时清除旧图引用。防止客户端伪造缓存或把某话题图片套给另一话题。
- 处理保存使用现有sourceFingerprint、target-cache比较和maintenance generation保护；失败保留同来源旧图，不覆盖并发新日报/编辑。已有归档只读，分享更新复制到主库。

## 默认与后台
- 日报/ShareEn生成后自动处理其可用图片；已有英文和文案不因图片失败而丢失。
- 后台提供补齐配图和单张重新取景按钮，使用现有sharing串行任务与日志。format='images'，可选topicId，force控制重处理；不得顺带重翻正文。
- 分享生成format='all'/'shareen'也补齐图片；format='english'不处理图片。force重做文字时同来源缓存默认复用，显式images+force才强制视觉重处理。
- 点击预览、编辑、PNG/ZIP/TXT下载均不会发起AI。旧稿可以单独补齐图片，无需重做日报。

## 验证
真实AI与生产库不用于测试。用模拟视觉与有效图像fixture验证主体保护、尺寸、方向、故障降级、缓存、单张重处理、串行任务、认证、私有字节隔离、并发和归档往返；浏览器检查三行总览、宽图/分栏/隐藏/失败、情绪条、PNG/ZIP与手机布局。最后独立code review、完整测试、lint与build，不自动推送。
