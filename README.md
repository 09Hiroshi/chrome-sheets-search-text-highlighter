# Sheets Search Text Highlighter

Google スプレッドシートで検索した語を見つけやすくする Chrome 拡張機能です。ブラウザーが文字範囲を正確に取得できるテキスト欄では、一致した文字に背景色を付けます。セルの値や書式は変更しません。

## Chrome ウェブストアからインストールする

1. Chrome ウェブストアで [Sheets Search Text Highlighter](https://chromewebstore.google.com/detail/jiamafchcemfhbmfmajoikieigcjpfcp?utm_source=item-share-cb) を開く。
2. 「Chrome に追加」を選びます。
3. Chrome の確認画面で「拡張機能を追加」を選びます。
4. Google スプレッドシートのタブを再読み込みします。

## 使い方

1. Google スプレッドシートを開き、検索（Windows / ChromeOS は `Ctrl + F`、Mac は `⌘ + F`）を使います。
2. 検索語を入力して、一致するセルへ移動します。
3. セルを編集中など、文字範囲を正確に取得できる欄では、一致した文字が背景色で強調されます。

## 表示について

通常表示中のセルは Google スプレッドシートが Canvas で描画しているため、セル内の文字だけを正確にハイライトできません。その場合、一致したセルは Google スプレッドシート標準の選択枠で示されます。文字の位置を推定して塗ることはせず、誤った箇所をハイライトしないようにしています。

数式バーなどが入力欄として表示され、文字範囲を取得できない場合も、文字の一部をハイライトできないことがあります。

## プライバシー

拡張機能は `docs.google.com/spreadsheets` のページで動作します。検索語やセルの内容を外部に送信したり、保存したりしません。
