# 手机内容扩展的数据形状

继续使用上游 profile 和 research packs。下面是增量字段，均为虚构数据形状示意；不能当作场所/航班事实。

## 身份和币种

新工作台 `mobile-app.json.handbook_id` 是稳定的本机记录身份；render 会将其写入 `research/framing.json`。`currency` 是三位币种代码，`currencies` 是可选的其他币种列表。不要根据历史旅行固定某一种币种。网页外壳的 name/short_name 会公开出现在解锁页与 manifest，敏感时用通用名称。

## 用户提供的航班

`research/framing.json.source_transport_plan`：

```json
[{"date":"2030-06-01","service":"示例航班","travelers":"示例同行者","route":"出发地 → 目的地","departure":"待核对","arrival":"待核对","terminal":"待核对","status_label":"用户提供的计划 · 未核票","notes":"仅为字段示例，不表示真实预订。"}]
```

原有 transport / trip-decisions 已有的已确认信息仍保留。只有用户真实提供的票据或明确确认才改变状态，不把官网时刻或候选航班当作用户订单。不要把不同参与人的航段混到一起。

## 每日交通比较

在 itinerary 的每一天加入 `transport_options`：

```json
{
  "recommendation":"根据当天实际路线、同行人和行李判断。",
  "road":{"route":"起点 → 终点","steps":["说明租车/包车/叫车及上下车位置。"],"duration_note":"经核查后填写范围与缓冲。","assessment":"说明优缺点、停车、步行和路线强度。","conditions":["车位、驾照、跨境条件等按需要核实。"]},
  "public":{"route":"起点 → 车站 → 终点","steps":["列线路、方向、换乘、出口及末端步行。"],"duration_note":"含等候和接驳的估计范围。","assessment":"比较换乘、无障碍、炎热/雨天及行李负担。","conditions":["不可行时直接写原因和备选，不虚构班次。"]},
  "source_urls":["https://example.org/official-source"]
}
```

具体出发时间由实际锚点倒推，保留排队、换乘、休息和航站楼缓冲。道路方案需区分自驾与乘车，不把网约车写成租车。来源链接必须为正常 HTTP(S) 地址，不能含运行脚本。

## 三语词句

在语言模块提供 `local_label`、`language_code`、keyword_groups、phrase_groups，以及同组同顺序的 english_keyword_groups、english_phrase_groups。每个本地项和英语项共享相同中文 meaning。

```json
{
  "local_label":"法语","language_code":"fr-FR",
  "keyword_groups":[{"title":"礼貌","items":[{"term":"Merci","meaning":"谢谢"}]}],
  "english_keyword_groups":[{"title":"礼貌","items":[{"term":"Thank you","meaning":"谢谢"}]}],
  "phrase_groups":[{"title":"点餐","items":[{"sentence":"L’addition, s’il vous plaît.","meaning":"请结账。"}]}],
  "english_phrase_groups":[{"title":"点餐","items":[{"sentence":"The bill, please.","meaning":"请结账。"}]}]
}
```

这些是语言格式示例；真实手册优先交通、点餐、入住、预约、找洗手间、付款、求助等适用场景。多国行程在组名中明确适用国家；必要时为不同语言使用不同语言代码，不让一种语言的朗读器读取另一种语言。
