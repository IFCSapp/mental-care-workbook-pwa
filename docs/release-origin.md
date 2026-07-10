# 販売版の専用originとCSP

販売版は、`https://ifcsapp.github.io` では公開しません。localStorageはpathではなくorigin単位で共有されるため、販売版専用のHTTPS originを1つ用意し、そのoriginにはこのワークブック以外を配置しません。

## Release build

1. 専用domainを決め、DNSをhosting providerへ向ける。
2. provider側でcustom domainとTLSを有効にする。
3. 次のように専用originを明示してbuildする。

   `VITE_PRODUCT_ORIGIN=https://<専用domain> npm run build:release`

`build:release` は、origin未指定、path付きURL、HTTP、`https://ifcsapp.github.io` を拒否します。通常の `npm run build` は既存GitHub Pagesのpreview用で、販売版のrelease判定には使いません。

## Hosting

`public/_headers` はCloudflare Pages等のheaders対応hostingで、同一originのscriptだけを許可し、外部接続先を同一originへ限定します。現行workはinline scriptを含むため `unsafe-inline` を残していますが、第三者script URLは許可していません。

GitHub Pagesはcustom response headerを設定できないため、販売版hostingには使用しません。Cloudflare Pagesを使う場合はbuild commandを上記release build、output directoryを`dist`に設定し、custom domainを接続します。

## 公開前の外部設定gate

- DNSが専用domainをhostingへ向いている。
- TLS証明書が有効である。
- `location.origin` が`https://ifcsapp.github.io`と異なる。
- response headerのCSPが`public/_headers`どおり返る。
- 別製品originから、`mentalCareWorkbookProfile`、`worksheet_auto_save_v1`、`dots_work_state_v3`、`act_worksheet_standalone_data`、`control_map_state_v1`を読めないことをbrowser testで確認する。
- Networkで第三者scriptが0件である。
