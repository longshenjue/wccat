# ShareEn 配文写法

目标：强化 **WcCAT** 品牌，同时让读者对具体话题产生兴趣并打开卡片了解背景。与卡片生成共用一次 AI 请求，产出 2～3 段候选、推荐其中一段，缓存后可切换或手改。

用户已确认品牌曝光优先：所有模板首行固定 `WcCAT Daily Hot`，正文钩子灵活变化，结尾保留品牌签名或引导阅读 WcCAT 卡片。ShareEn 是版本名，不替代 WcCAT 主品牌。生成字数预算需包含品牌行。

以下示例保留早期写法探索。正式 ShareEn 实现中，所有模板均统一加入原日榜 TOP1 / TOP2 / TOP3 编号简述；模板只决定正文开场，并由服务器添加 WcCAT 品牌行及阅读引导。示例涉及不同选题，不代表正式配文可省略 TOP3。

## 1. 三条速览 · daily_digest

适合当天重点较分散、需要快速交代内容范围的情况。三个入口与配套卡片对应；以下示例沿用用户配文中选取的三个话题。

```text
WcCAT Daily Hot 🇨🇳

China’s internet today:
🏆 BLG takes the title
🏥 A hospital faces a fraud investigation
🏠 Nearly 60% of households have ≤2 people

The Top 10, with context. See the cards 👇
— WcCAT
```

## 2. 头条引入 · story_led

适合某个话题明显突出，且资料足够解释背景和关联。

```text
WcCAT Daily Hot 🇨🇳

BLG took the top spot in this day’s Chinese trend list.

The championship, the teams, and the context behind the attention—alongside today’s other top stories.

See the cards 👇
— WcCAT
```

## 3. 数字开场 · number_led

适合一个有解释价值的数字出现在精选卡片里。单位、近似表达与对象应保留；不从一次统计推导历史趋势。

```text
WcCAT Daily Hot 🇨🇳

Nearly 60% of Chinese households have no more than two people.

That statistic is drawing attention across Chinese platforms. What questions does it raise about housing and care?

Today’s trends, in context 👇
— WcCAT
```

## 4. 熟悉的海外切入点 · global_bridge

适合科学、技术、品牌或国际事件，先用读者熟悉的对象搭桥。

```text
WcCAT Daily Hot 🇨🇳

A U.S. spacecraft. A milestone in Chinese feeds.

Voyager 1’s one-light-day journey is one of today’s trending stories in China.

The Top 10—and the context behind three stories—in the cards 👇
— WcCAT
```

## 5. 话题反差 · topic_contrast

适合多个领域同时出现。本轮四张样稿含电竞、旅行者和家庭结构，因此可以采用这一写法。

```text
WcCAT Daily Hot 🇨🇳

An esports crown. A distant spacecraft. A question about household size.

Three very different stories from China’s internet today.

See the Top 10 and take a closer look in the cards 👇
— WcCAT
```

## 自动选择建议

1. 先确定卡片的精选话题与已有材料，再判定适用写法。
2. 同一次 AI 请求生成 2～3 个适用候选，并推荐其中一个；不是五种模板各调用一次 AI。
3. 优先选择具体、自然、与卡片相符的开头；近期已用文案可作为去重复参考，不机械按日期轮换。
4. 默认用可适配普通短帖的字数预算；正式实现采用 X 加权字符计数。上述短文的长度仅为设计参考。
5. 缓存候选、推荐理由与最终稿，管理员切换/编辑不消耗 Token；下载图片时直接带出已选配文。

品牌首行固定为 `WcCAT Daily Hot`，配图采用同一字标及 `CHINA, IN CONTEXT.` 口号。末尾可以使用 `— WcCAT` 或 `Explore today’s WcCAT cards 👇`。自动选择只改变内容写法，不删掉品牌，不用未确认的 X 账号或域名替代字标。

## 对原始配文的调整建议

- “1.4 billion people ... talking” 会让读者理解为参与人数；改为平台观察范围，例如 `Across China’s internet today`。
- 原稿约 380 个 Unicode 码点，不是准确的 X 加权计数；普通短帖需进一步压缩。长帖帐号也可以保留简短版本作默认。
- `World Championship` 需要赛事材料支持；不确认时使用 `title win`。具体平台应来自该话题的来源列表。
- `Full AI-analyzed breakdown` 应与卡片实际内容一致；可用 `Top 10, with context` 或 `3 closer looks`。
- 不是真实串帖时不默认加 🧵。三条主题最好与三张解读卡保持对应。

官方参考：https://help.x.com/en/using-x/how-to-post
