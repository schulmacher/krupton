# External Bridge: andmekogumise kiht

External Bridge on süsteemi liides väliste krüptobörsidega. Selle ülesanne on koguda reaalajas turuandmeid mitme protokolli kaudu ning tagada andmete püsiv salvestamine kõrge töökindlusega. Komponent realiseerib mitmeprotsessilise arhitektuuri, mis on optimeeritud suure läbilaskevõime ja tõrkeisolatsiooni jaoks.

## Arhitektuuri ülevaade

External Bridge kasutab protsessipõhist eraldusstrateegiat kolme protsessitüübiga:

**REST API pärija protsessid** töötavad tõmbepõhisel mudelil, pärides perioodiliselt ajaloolisi tehinguandmeid ja tehinguraamatu hetktõmmiseid. Iga sümbol-platvorm kombinatsioon võib olla omaette protsessis.

**WebSocket voogude protsessid** hoiavad püsivaid ühendusi börside WebSocket lõpp-punktidega ning tarbivad reaalajas tehinguid ja tehinguraamatu diferentsiaaluuendusi.

**Salvestuse haldusprotsessid** tegelevad perioodilise statistika kogumise, varunduse orkestreerimise ja ajaloolise andmestiku säilituspoliitikatega.

Selline dekompositsioon võimaldab sõltumatut juurutamist (`deployment`) ja taaskäivitamist iga protsessitüübi jaoks ilma teisi mõjutamata.

## Service Context muster

Iga protsess saab kontekstiobjekti, mis kapseldab kõik välised sõltuvused: **salvestuskäepidemed** (tüübiturvaline ligipääs RocksDB-põhistele püsikihtidele), **ZeroMQ Publisher'id** (IPC kanalid allavoolu tarbijatele), **kiiruspiirajad** (platvormispetsiifiline päringute drosseerimine) ja **tüübistatud API kliendid** (skeemivalideeritud liidesed).

Konteksti loomine järgib funktsionaalse kompositsiooni põhimõtet, tehes sõltuvuste järjestuse eksplitsiitseks.

## REST API pärija teostus

Iga iteratsioon täidab mitmefaasilise töövoo:

1. **Parameetrite konstrueerimine**: järgmise Trade’i identifikaatori leidmine viimase salvestatud tehingu põhjal
2. **Kiiruspiiramine**: libiseva akna algoritm seadistatavate kvootidega
3. **Päringu teostus**: HTTP-päring eksponentsiaalse tagasilöögiga rikete korral
4. **Vastuse püsisalvestus**: salvestamine RocksDB-sse
5. **Sõnumite levitamine**: avaldamine ZeroMQ publisher'ite kaudu
6. **Intervalli haldus**: järgmise iteratsiooni ajastamine

**Kiiruspiiramise strateegia**: Libiseva akna algoritm, mis jaotab päringud ühtlaselt kogu ajavahemiku peale (`windowMs / maxRequests`). Vigade korral rakendatakse eksponentsiaalset backoff'i kuni maksimumini (60 s).

## WebSocket voogude haldus

WebSocket-haldurid järgivad olekumasina mustrit: lahti ühendatud, ühendumas, ühendatud, taasühendumas. Haldur hoiab ootel tellimuspäringute registrit ja tuvastab kinnitusi, mis ei saabu määratud aja jooksul.

**Binance'i 24-tunnine piirang**: Ennetav taasühenduse ajastamine 23 tunni pärast.

**Päringu/vastuse korrelatsioon**: Binance kasutab numbrilisi päringu ID-sid; Kraken seostab vastused kanali ja sümbolite kombinatsioonidega.

## Tehinguraamatu järjepidevuse haldus

Binance'i diferentsiaaluuendused sisaldavad järjestusidentifikaatoreid (`U`, `u`). Pidev voog rahuldab invariandi: `M₂.U = M₁.u + 1`. Invariandi rikkumine käivitab snapshot'i päringu REST API kaudu.

## Ajalooliste tehingulünkade täitmine

Lüngatuvastuse algoritm kasutab tehinguidentifikaatorite järjestikulisust. Protsess: loetakse viimane API-tehingu ID → skaneeritakse WebSocket tehingud → jälgitakse järjestuse kulgu → lünga korral konstrueeritakse REST päring API-tehingu ID parameetriga.

Algoritm käsitleb suvalise suurusega lünki, tükeldades need API limiidi järgi (100 tehingut päringu kohta).

## Sümbolite normaliseerimine

Normaliseeritud formaat on väiketäheline ja alakriipsuga eraldatud: `{base}_{quote}` (nt `btc_usdt`). Börsid pakuvad metaandmete endpoint'e sümbolite kaardistamiseks.

**Binance**: `/api/v3/exchangeInfo` tagastab `baseAsset` ja `quoteAsset` väljad.

**Kraken**: Keerukam struktuur kahe endpoint'iga (`/0/public/Assets`, `/0/public/AssetPairs`) ja oma varanimetustega (XBT, XBTC ja BTC erinevates liidestes Bitcoin'i kohta).

Süsteem vajab kahesuunalist normaliseerimist: sissetulevate andmete töötluseks ja API päringute koostamiseks.

## Salvestuse varundus ja statistika

**Varunduse orkestreerimine**: Faasid hõlmavad pakkimist (gzip), kontrollsumma (SHA-256) genereerimist, pilvesünkroniseerimist (rclone) ja säilituspoliitika jõustamist (max 7 varukoopiat).

**Statistika kogumine**: Perioodiline kataloogipuude skaneerimine, tulemuste eksponeerimine Prometheus meetrikatena (`storage_directory_size_bytes`, `storage_directory_file_count`).

## Keskkonnapõhine konfiguratsioon

Konfiguratsioon põhineb TypeBox skeemidel ja keskkonnamuutujatel: `SYMBOLS` (komadega eraldatud normaliseeritud paarid), `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_MS`, `API_BASE_URL`, `API_KEY`, `STORAGE_BASE_DIR`.

## Kokkuvõte

External Bridge realiseerib robustse andmekogumise kihi protsessipõhise isoleerimisega, lünkade tuvastuse ja täitmisega ning sümbolite normaliseerimisega. Arhitektuur loob aluse deterministlikule offline taasesitusele, mis on masinõppe treeningandmete reprodutseeritavuse seisukohalt kriitiline.
