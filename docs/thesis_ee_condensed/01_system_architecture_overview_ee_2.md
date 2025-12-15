# Süsteemi arhitektuuri ülevaade

Käesolevas peatükis kirjeldatakse reaalajas krüptovaluutade turuandmete töötlemise ja ennustamise süsteemi arhitektuurilist disaini. Süsteem on realiseeritud polüglotse monorepona (TypeScript, Python, Rust) teenusepõhise arhitektuuriga, kus vastutused on eraldatud andmete sissevõtu, transformatsiooni, talletuse ja ennustuse kihtide vahel.

## Repositooriumi struktuur

Monorepo järgib domeenipõhist kaustastruktuuri kolme põhidirektori ümber. Kataloog `apps/` sisaldab iseseisvalt juurutatavaid teenuseid: **external-bridge** (andmete sissevõtt börsidelt), **internal-bridge** (andmete transformatsioon) ja **py-predictor** (masinõppemudelite treenimine ja inferents). Iga rakendus toimib autonoomse teenusena minimaalsete sõltuvustega.

Kataloog `packages/` sisaldab jagatud teeke: teenuseraamistikud, API kliendid, talletusabstraktsioonid, sõnumside teegid ja utiliidid. Implementatsioonid on **rakenduseagnostilised**, tagades korduskasutatavuse eri teenuste kontekstis.

Kataloog `runtime/` sisaldab juurutusinfrastruktuuri ja monitooringu stack'i (VictoriaMetrics, Perses) konfiguratsioone.

### Zero-Knowledge Setup

Repositoorium järgib "zero-knowledge setup" filosoofiat: arenduskeskkonna täielikuks käivitamiseks piisab kolmest käsust: `pnpm install` (sõltuvused + platvormispetsiifilised binaarid), `pnpm build` (sõltuvuste järjekorras kompileerimine) ja `pnpm --filter '<workspace>' start` (teenuse käivitamine). See abstraheerib erinevate runtime'ide keerukuse ja võimaldab uutel arendajatel käivitada kogu süsteemi minutitega.

## Keeleagnostiline töövoog pnpm-iga

Kuigi pnpm on JavaScripti paketihaldur, kasutatakse seda **keeleagnostilise task runner'ina** kogu monorepo ulatuses. Iga workspace defineerib standardiseeritud npm-script'id (`build`, `test`, `lint`), mis delegeerivad käsu sobivale keelespetsiifilisele tööriistale: Python paketid kasutavad `uv run pytest`, Rust kasutab `cargo build`, TypeScript kasutab `tsc` ja `vitest`. Käsk `pnpm --filter '<package-name>' <command>` käivitab vastava käsu konkreetses paketis.

## Granulaarne arendusvoog PM2 abil

PM2 protsessihaldur võimaldab peenhäälestatud kontrolli arenduskeskkonna üle hierarhiliste ecosystem-failide abil. Arendaja saab käivitada ainult aktuaalsed teenuste kombinatsioonid, vähendades ressursikulu. PM2 **watch mode** taaskäivitab protsesse automaatselt failimuudatustel. Docker konteinerid on alternatiiv produktsioonikeskkonnas, kuid arenduse ajal on otsekäivitamine kiirem ja debuggimine lihtsam.

## Teenusepõhine arhitektuur

### Teenuseraamistik

Pakk `service-framework-node` pakub Node.js teenustele: struktureeritud logimine korrelatsiooni-ID-dega, mõõdikute eksponeerimine Prometheus-formaadis, tüübiturvaline keskkonnakonfiguratsiooni valideerimine TypeBox skeemidega, protsessi elutsükli haldus (signaalid, graceful shutdown) ja HTTP/WebSocket serveri haldus Fastify baasil.

Pakk `py-service-framework` pakub Pythoni teenustele samaväärseid võimekusi keskkonna Pydantic valideerimisega, tagades ühtlustatud operatsioonilise käitumise keelteüleselt.

### API kliendi arhitektuur

**HTTP REST klient** (`api-client-node`) kasutab Undici't kõrge jõudlusega HTTP päringuteks: path-parameetrite interpolatsioon, query string'i ehitus, päringu/vastuse valideerimine TypeBox skeemidega ja struktureeritud veakäsitlus.

**WebSocket klient** (`api-client-ws-node`) haldab WebSocket ühendusi, valideerib runtime'is sõnumeid ja pakub tüübiturvalist voohaldust. Klient implementeerib automaatse taasühenduse ja ping/pong heartbeat mehhanismi.

**Skeemide definitsioonid** (`api-interface`) sisaldab ühtseid TypeBox skeeme Binance'i ja Kraken'i API-de jaoks, pakkudes nii compile-time tüübituletust kui runtime-valideerimist.

### Talletusinfrastruktuur

Pakk `rust-rocksdb-napi` pakub RocksDB bindinguid Rustis, kasutades NAPI-RS-i Node.js jaoks ja PyO3 Pythoni jaoks. Custom-implementatsioon oli vajalik, kuna olemasolevad teegid on hooldamata või ei toeta vajalikke funktsioone (nt secondary instantsid).

Pakk `persistent-storage-node` on kõrgema taseme TypeScripti talletuskiht entiteedipõhiste abstraktsioonidega. Entiteedid rakendavad automaatset alamindeksite haldust ja andmetransformaatorid teisendavad platvormispetsiifilised formaadid ühtseteks skeemideks.

**Primary/secondary muster** on RocksDB puhul oluline: primary instants võimaldab kirjutamisoperatsioone, samal ajal kui mitmed read-only secondary instantsid saavad samu andmeid paralleelselt lugeda. See tagab, et ajalooliste andmete taasesitus ei sega reaalajas sissevõttu.

**Talletusbackend'i evolutsioon**: JSONL → SQLite → RocksDB. JSONL'il puudus kompressioon ja efektiivne juhuslik lugemine. SQLite'il tekkis truncation probleeme (kümneid minuteid miljonite ridade kustutamiseks). RocksDB LSM-tree pakub sisseehitatud kompressiooni (LZ4, Zstd), efektiivset vahemiku kustutamist ja write-optimiseeritud append'i.

**Jõudluskarakteristikud**: Iga sümbol talletatakse eraldi RocksDB instantsis, tagades isoleeritud kirjutamislatentsused, paralleelse compaction'i ja selektiivse lugemise. RocksDB kompressioon vähendab andmemahtu 5-10× võrreldes toore JSON'iga. Mahuvõrdlus on reprodutseeritav repositooriumis olevate tööriistadega: RocksDB dump'imine JSONL formaati (`scripts/rocksdb.js`) ja SQLite konversioon mahuvõrdluseks (`scripts/jsonl-to-sqlite.py`) [1].

### Protsessidevaheline sõnumside

ZeroMQ pakub suure jõudlusega asünkroonset sõnumivahetust Node.js teenuste vahel. IPC latentsus on ~30-50 μs roundtrip. Determinismi tagamiseks kontrollivad consumerid järjestikuste ID-de järjestust; lünga korral täidetakse puuduvad sõnumid RocksDB secondary instance'ist.

Pakk `messaging-node` teostab ZeroMQ pub/sub mustri registripõhise lähenemisega mitme stream'i haldamiseks.

### Võrdlus: RocksDB+ZeroMQ vs Apache Kafka

Võrdluse läbiviimiseks loodi benchmark skript, mis mõõdab 1 miljoni sõnumi edastamise jõudlust erinevate tehnoloogiate puhul. Latentsuse mõõtmiseks manustatakse iga sajanda sõnumi sisse saatmise ajatempel (nanosekundites), mis võimaldab konsumeril arvutada täpse edastusaja. Kafka käivitatakse KRaft režiimis Docker konteineris, ZeroMQ IPC kasutab Unix domain sokleid, ZeroMQ TCP kasutab localhost loopback'i. Binaarne test elimineerib JSON serialiseerimise, näidates IPC aluskulu. Kõik testid kordavad sama Binance TradeStream formaati.

| Mõõdik                    | Kafka (KRaft)      | ZeroMQ IPC + RocksDB | ZeroMQ IPC (puhas) | ZeroMQ IPC (binaarne) |
| ------------------------- | ------------------ | -------------------- | ------------------ | --------------------- |
| Mediaanlatentsus          | ~26,4 ms           | ~8,4 ms              | ~6,6 ms            | ~6,3 ms               |
| Läbilaskevõime            | ~144 500 sõnumit/s | ~29 900 sõnumit/s    | ~38 800 sõnumit/s  | ~41 200 sõnumit/s     |
| Latentsuse kiirenemine    | 1× (baas)          | 3,1×                 | 4,0×               | 4,2×                  |
| Arenduse keerukus         | Keskmine           | Madal                | Madal              | Madal                 |
| Operatsiooniline overhead | Kõrge (klaster)    | Madal                | Minimaalne         | Minimaalne            |

: Tabel 1.1 Sõnumivahenduse tehnoloogiate võrdlus (mõõdetud 1M sõnumiga) [2]

**Latentsuse koostis**: Binaarne ZeroMQ IPC (~6,3 ms) esindab võrgu- ja sünkroniseerimise aluskulu. JSON serialiseerimine lisab ~300 μs. RocksDB püsisalvestus lisab ~1,8 ms täiendavat latentsust.

**Miks mitte Kafka**: Ühe masina protsessor suudab käsitleda 100+ sümboli voogusid; deterministlik arendus nõuab kohalikku talletust; Kafka 26 ms latentsus on 3× aeglasem kui ZeroMQ IPC koos RocksDB-ga. Autor antud töö raames üritas uurida alternatiive ning leida väiksema latentsusega lähenemise.

**Märkus läbilaskevõime kohta**: RocksDB madalam läbilaskevõime (võrreldes Kafka'ga) on seotud konservatiivse mälu konfiguratsiooni (8 MB write buffer, 1 background job) ja üksiku compaction thread'iga. See konfiguratsioon võimaldab käivitada kümneid paralleelseid väikeseid RocksDB instantse minimaalsete ressurssidega, mis on oluline mitme sümboli samaaegsel töötlemisel.

### Jagatud infrastruktuur

Pakk `utils` sisaldab: eksponentsiaalne backoff retry (`tryHard`), asünkroonsed koordineerimisprimitiivid (promise-lock'id, event loop yield), kollektsioonide abifunktsioonid ja tüübi-kaitsjad.

Pakk `config` koondab monorepo-ülesed konfiguratsioonifailid (ESLint, Prettier, TypeScript, Vitest).

Jälgitavus on realiseeritud **Dashboard-as-Code** põhimõttel Perses + VictoriaMetrics kombinatsiooniga, kus armatuurlaudade definitsioonid hoitakse versioonihalduses.

## Arhitektuursed mustrid

**Skeemipõhine tüübikindlus**: TypeBox skeemid pakuvad compile-time tüübikindlust ja runtime-valideerimist, elimineerides vajaduse eraldi tüübifailide ja validaatorite järele.

**Entiteedipõhine talletusabstraktsioon**: Talletus-entiteedid kapseldavad platvormispetsiifiliste API vastuste talletusloogika normaliseeritud liidese taha.

**Registrimuster IPC jaoks**: Publisher'i ja subscriber'i registrid haldavad ZeroMQ soklite kogumeid, võimaldades dünaamilist stream'i valikut runtime'is.

**Platvormi laiendatavus**: Uue börsi integratsioon nõuab ainult skeemide deklareerimist ja geneeriliste factory-funktsioonide kasutamist.

## Deterministlik offline-arendus

RocksDB-põhine talletus koos **SegmentedLog** abstraktsiooniga võimaldab süsteemil töötada täielikult offline režiimis. Ajaloolised turuandmed talletatakse järjestikuliste append-operatsioonidega. Primary/secondary muster võimaldab deterministlikku taasesitust, kus internal-bridge ja ennustus-worker'id töötlevad igas iteratsioonis täpselt sama sündmuste jada.

**Olulisus masinõppe arenduses**: Feature'ite arvutamine ja mudeli hindamine peavad põhinema täpselt samadel andmejadadel, et mudelite võrdlus oleks aus. Kontrollitud testkeskkond võimaldab valideerida andmetransformatsiooni loogikat ilma sõltuvuseta välisest infrastruktuurist.

## Andmevood ja süsteemi integreeritus

Täielik andmevoog: andmed saabuvad **external-bridge** kaudu → normaliseeritakse **internal-bridge** teenuses → talletatakse RocksDB-sse → ZeroMQ pub/sub jagab andmeid → **py-predictor** kasutab andmeid treenimiseks ja ennustamiseks.

Arhitektuur rakendab selget vastutuse eraldamist: teenuseraamistik käsitleb operatsioonilisi teemasid, API kliendi kiht abstraheerib börsiga suhtluse, talletusinfrastruktuur pakub keeleteülest püsitalletust, sõnumside kiht kasutab ZeroMQ pub/sub mustrit ja jagatud infrastruktuur tagab ühtse stiili kogu koodibaasis.

Kokkuvõttes realiseerib arhitektuur streaming-semantika RocksDB ja ZeroMQ kombinatsiooniga, vältides hajusbrokerite operatsioonilist keerukust. Kompromissiks on mitme andmebaasi instantsi haldamine, taasesitusloogika implementeerimine ning reaalajas sõnumilünkade tuvastamise ja täitmise mehhanismide rakendamine teenuste tasemel.
