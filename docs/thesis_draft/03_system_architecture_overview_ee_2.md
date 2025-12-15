# Süsteemi arhitektuuri ülevaade

Käesolevas peatükis kirjeldatakse reaalajas krüptovaluutade turuandmete töötlemise ja ennustamise süsteemi arhitektuurilist disaini. Süsteem on realiseeritud polüglotse monorepona – see tähendab, et ühes ühises repositooriumis kasutatakse mitut keelt (TypeScript, Python, Rust) – ning see kasutab teenusepõhist arhitektuuri (service-oriented architecture), kus vastutusandmed on selgelt eraldatud andmete sissevõtu, transformatsiooni, talletuse ja ennustuse kihtide vahel.

## Repositooriumi struktuur

Monorepo järgib domeenipõhist kaustastruktuuri, kus kood jaotatakse vastutuse ja juurutusmudeli järgi. Repositoorium on organiseeritud kolme põhidirektori ümber, millest igaüks täidab eraldi arhitektuurilist rolli.

Kataloog `apps/` sisaldab iseseisvalt juurutatavaid teenuseid, mis rakendavad süsteemi tuumfunktsionaalsust.

- **external-bridge** teenus haldab andmete sissevõttu krüptovaluutabörsidelt,
- **internal-bridge** teenus teostab andmete transformatsiooni ja voogude (stream’ide) haldust,
- **py-predictor** teenus tegeleb masinõppemudelite treenimise ja inferentsiga (ennustuste arvutamisega).

Iga rakendus toimib autonoomse teenusena, millel on hästi defineeritud vastutus ja minimaalne sõltuvus teistest rakendustest.

Kataloog `packages/` sisaldab jagatud teeke ja ristuvat infrastruktuuri, mida kasutavad nii rakendused kui ka teised paketid pnpm-i workspace’i protokolli kaudu. Siia kuuluvad näiteks:

- teenuseraamistikud (service frameworks), mis pakuvad operatsionaalset võimekust,
- API kliendid, mis abstraheerivad börsiliideseid,
- talletusabstraktsioonid, mis kapseldavad püsitalletuse loogika,
- sõnumside teegid protsessidevaheliseks suhtluseks,
- utiliidid igapäevaste korduvate operatsioonide jaoks.

Nende pakettide implementatsioon on teadlikult **rakenduseagnostiline** – st nad ei sõltu otseselt ühestki konkreetsest teenusest – mis tagab korduskasutatavuse eri teenuste kontekstis.

Kataloog `runtime/` sisaldab juurutusinfrastruktuuri ja monitooringu stack’i konfiguratsioone, mis on lahutatud rakenduskoodist, et võimaldada infrastruktuuri iseseisvat arendamist. Siia kuuluvad näiteks:

- VictoriaMetrics’i ajarearepositooriumi konfiguratsioon mõõdikute talletamiseks,
- Perses’i “dashboard-as-code” (st armatuurlaud konfiguratsioonifailidena) definitsioonid jälgitavuse visualiseerimiseks.

Selline organisatsioon tagab selged sõltuvuspiirid: rakendused sõltuvad pakettidest, aga paketid ei sõltu rakendustest. See eristus võimaldab:

- selektiivset juurutamist – iga teenust saab eraldi juurutada ilma kogu monorepot uuesti ehitamata;
- infrastruktuuri komponentide iseseisvat versioonihaldust – infrastruktuuri uuendused ei riku rakenduskoodi stabiilsust.

### Zero-Knowledge Setup filosoofia

Repositoorium järgib “zero-knowledge setup” filosoofiat: uue arendaja sisenemistakistus peab olema võimalikult väike. Idee on, et arenduskeskkonna täielikuks käivitamiseks piisab kolmest järjestikusest käsust.

Käsu `pnpm install` käivitamine repositooriumi juurkaustas:

- lahendab workspace’i sõltuvused,
- seab üles runtime-infrastruktuuri, sh tõmbab alla platvormispetsiifilised binaarid arendaja operatsioonisüsteemile (nt VictoriaMetrics, Perses, jne).

See elimineerib vajaduse käsitsi alla laadida ja konfigureerida jälgitavuse/monitooringu komponente.

Järgmine käsk `pnpm build` kompileerib kõik TypeScripti paketid ja Rusti native-binding’ud monorepo ulatuses sõltuvuste järjekorras, tagades, et jagatud teegid ehitatakse enne neid sõltuvaid rakendusi. Workspace’i teadlik ehitusprotsess kompileerib uuesti ainult muutunud paketid ja nende sõltlased, mis lühendab ehitusaega.

Lõpuks `pnpm --filter '<workspace-name>' start` käivitab ükskõik millise rakenduse või runtime-teenuse ilma käsitsi konfiguratsiooni, keskkonnamuutujate või keelespetsiifiliste tööriistade tundmise vajaduseta. See ühtne liides abstraheerib erinevate runtime’ide (Node.js, Python, Rust) keerukuse ja võimaldab uutel arendajatel käivitada kogu süsteemi või üksikuid komponente minutitega pärast repositooriumi kloonimist.

## Keeleagnostiline töövoog pnpm-iga

Kuigi pnpm on algselt JavaScripti paketihaldur, kasutatakse seda siin **keeleagnostilise task runner’ina** kogu monorepo ulatuses. See disain otsus lahendab väljakutse hallata heterogeenset koodibaasi nii, et arendaja töövoog ja CI/CD pipeline’id jäävad ühtseks.

Iga workspace – sõltumata sellest, kas see on TypeScripti, Pythonis või Rustis – defineerib standardiseeritud npm-script’id oma `package.json` failis. Need script’id loovad ühtse liidese tavaliste käskudega: `build`, `test`, `lint`, `format`, `typecheck`. Script’i sisu delegeerib käsu sobivale keelespetsiifilisele tööriistale.

Näiteks:

- Python paketid kasutavad testimiseks `uv run pytest` ja lintimiseks `uv run ruff check`,
- Rust paketid kompileeritakse käsuga `cargo build`,
- TypeScript paketid kasutavad kompileerimiseks `tsc` ja testimiseks `vitest`.

pnpm-i workspace’i filtrid annavad ühise käsurealiidese:  
`pnpm --filter '<package-name>' <command>` käivitab vastava käsu konkreetses paketis, abstraheerides ära keelespetsiifilised detailid.

See lähenemine eemaldab vajaduse mäletada eraldi käske iga keele jaoks või liikuda igasse kataloogi eraldi. Näiteks:

- `pnpm --filter 'service-framework-node' test` käivitab TypeScripti testid,
- `pnpm --filter 'py-service-framework' test` käivitab Pythoni testid,

kuigi taustal kasutatakse täiesti erinevaid testiraamistikke.

Sama muster laieneb CI/CD pipeline’idele: üksainus pipeline’i konfiguratsioon saab jooksutada samu käske kõigi tööruumide peal, sõltumata sellest, kas tegu on TypeScripti teenuste, Pythoni worker’ite või Rusti moodulitega, käsitledes neid lihtsalt monorepo workspace’idena.

## Granulaarne arendusvoog PM2 abil

PM2 protsessihaldur võimaldab peenhäälestatud kontrolli mitme teenusega arenduskeskkonna üle, kasutades hierarhilisi **ecosystem** konfiguratsioonifaile. Muster aitab hallata mitut omavahel sõltuvat teenust nii, et ressursikulu ja arendaja kognitiivne koormus jäävad mõistlikuks.

Arendaja saab käivitada ainult talle aktuaalsed teenuste kombinatsioonid, kombineerides modulaarseid PM2 konfiguratsioonifaile. Näiteks kui fookus on Binance’i tehingute töötlemisel, saab käivitada ainult Binance’i BTCUSDT ja ETHUSDT tehingu- ja orderi-importijad, ilma kogu teenuste võrgustikku (sh Kraken, teised sümbolid või teenused) käivitamata. See vähendab masinalt nõutavaid ressursse ja piirab nähtava süsteemi osa ainult praegu töötatavate komponentidega.

Iga rakendus (external-bridge, internal-bridge, py-predictor) defineerib teenuse-spetsiifilised ecosystem failid. Kompositsioonifailid võimaldavad orkestreerida suvalist alamhulka teenustest: arenduse ajal saab jooksutada ainult vajalikke teenuseid, kuid vajadusel skaleerida kogu süsteemi integreeritud testimiseks.

PM2 **watch mode** jälgib failimuudatusi ja taaskäivitab protsesse automaatselt, mis annab kiire tagasiside iteratiivses arendustsüklis. Ecosystem lähenemine käsitleb Node.js teenuseid (TypeScript, mis jookseb `tsx` interpretatsiooniga) ja Pythoni teenuseid ühtlaselt, pakkudes sama protsessihalduse semantikat eri keelte lõikes.

### Alternatiiv: Docker konteineriseerimine

Docker konteinerid on alternatiivne juurutusstrateegia, mis sobib eriti hästi produktsioonikeskkonnas isolatsiooni ja reprodutseeritavuse tagamiseks. Aktiivse arenduse jaoks on aga otsekäivitamine host-masinas sageli mugavam:

- iteratsioonid on kiirem, sest puudub pildi uuesti ehitamise overhead,
- debuggimine on lihtsam (otse protsessile külge haakudes),
- failisüsteemi otsene ligipääs lihtsustab hot-reload’i,
- ressursikulu on väiksem, kuna vahepealne konteinerikiht puudub.

Seetõttu on PM2 otsene protsessihaldus loogilisem ja tõhusam arenduskeskkonnas, samal ajal kui Docker jääb eelistatud valikuks produktsioonis, kus on olulised isolatsioon ja infrastruktuuri teisaldatavus.

## Teenusepõhine arhitektuur

Süsteem kasutab teenusepõhist arhitektuuri, kus eri tööetappe teostavad omavahel eristatavad komponendid.

### Teenuseraamistik

Teenuseraamistik pakub standardiseeritud operatsioonilist vundamenti, mis annab ühtsed operatsioonivõimekused nii TypeScripti kui Pythoni teenustele. Kahekeelne tugi tagab, et operatsiooniline käitumine (logimine, monitooring, lifecycle-management) on keelteüleselt ühesugune.

#### Service Framework Node

Pakk `service-framework-node` on Node.js/TypeScripti raamistik, mis pakub terviklikke operatsionaalvõimekusi:

- diagnostika struktureeritud logimisega, kasutades korrelatsiooni-ID sidumist (request trace üle teenusepiiride), kusjuures korrelatsiooni-ID tugi on praeguses arhitektuuris pigem _future proofing_ – ette valmistav võimekus, mis võimaldaks tulevikus laiendada süsteemi hajutatud päringute jälgimisega, kui see peaks osutuma vajalikuks,
- mõõdikute eksponeerimine Prometheus-formaadis VictoriaMetrics’i jaoks,
- tüübiturvaline keskkonnakonfiguratsiooni valideerimine TypeBox skeemidega,
- protsessi elutsükli haldus (signaalide käsitlemine, graceful shutdown, taaskäivitamine),
- HTTP ja WebSocket serveri haldus Fastify baasil.

Raamistik kasutab modulaarset **konteksti loomise mustrit**, kus subsüsteemide initsialiseerimine on selgelt eraldatud serveri elutsükli juhtimisest. See lihtsustab sõltuvuste süstimist testide jaoks ja võimaldab teenuse vajadustest lähtuvalt paindlikult kombineerida raamistikufunktsionaalsust.

#### Python Service Framework

Pakk `py-service-framework` pakub samaväärseid võimekusi Pythoni teenustele, kasutades:

- konfiguratsiooni valideerimiseks Pydantic’ut,
- protsessi elutsükli haldust,
- struktureeritud logimist,
- Prometheus mõõdikute eksponeerimist,
- HTTP serveri tuge.

Operatsioonilised mustrid on samad, mis Node’i raamistikus, mis tähendab, et monitooring, logimine ja lifecycle haldus on eri keelte teenustes ühtlustatud.

### API kliendi arhitektuur

API kliendi arhitektuur realiseerib kihtidena ehitatud abstraktsiooni börsiliidestest, kasutades skeemipõhist valideerimist. Sellest moodustub kolm spetsialiseeritud pakki.

#### HTTP REST klient

Pakk `api-client-node` on HTTP REST klient, mis kasutab Undici’t kõrge jõudlusega HTTP/1.1 päringute tegemiseks. Klient pakub:

- path-parameetrite interpolatsiooni (dünaamiliste URL-ide koostamine),
- query string’i ehitust automaatse encode’imisega,
- päringu ja vastuse keha (valikulist) valideerimist TypeBox skeemidega,
- struktureeritud errori käsitlemist (fetch error, HTTP staatus, valideerimisvead),
- autentimispealkirjade lisamist kaitstud endpoint’idele.

See abstraktsioon peidab börsispetsiifilised HTTP detailid ja annab TypeScripti kaudu tüübiturvalise liidese koos runtime-skeemide valideerimisega.

#### WebSocket klient

Pakk `api-client-ws-node` teostab WebSocket ühendused koos runtime-sõnumite valideerimise ja tüübiturvalise voohaldusega. Kasutatakse kompileeritud TypeBox valideerijaid, mis:

- kontrollivad sõnumite vastavust (valikuliselt) eeldatud skeemile,
- avastavad varakult protokollirikkumised või vigased sõnumid.

Voopõhine sõnumite eristamine toimub diskriminaatorfunktsioonide abil, mis võimaldab mitme voogu käsitleda ühe WebSocket-ühenduse peal. Klient käsitleb struktureeritult nii ühenduse vigu kui valideerimisvigu ja tagastab detailsed veakirjeldused (milline skeem ja kus täpselt rikuti). Tüübiturvaline handleri dispatch tagab, et iga handler saab juba õigesti tüübistatud sõnumiobjekti.

Klient implementeerib automaatse ühenduse taasloomise (reconnection) mehhanismi ühenduse katkemisel. Ühenduse katkemisel (võrguprobleem, serveri sulgemine) klient automaatselt proovib ühendust taasluua fikseeritud intervalliga, välja arvatud juhul kui ühendus suletakse käsitsi (`disconnect()`). Lisaks implementeerib klient ping/pong heartbeat mehhanismi, mis tuvastab "vaikse" ühenduse katkemise (server ei vasta pong-iga), käivitades automaatse taastloomise. See tagab süsteemi robustsuse ajutiste võrguprobleemide korral ilma manuaalse sekkumiseta.

#### Ühtsed skeemide definitsioonid

Pakk `api-interface` sisaldab ühtseid skeemide definitsioone Binance’i ja Kraken’i API-de jaoks, nii HTTP kui WebSocketi tasemel. Skeemid on defineeritud TypeBoxiga, mis annab:

- TypeScripti poolel automaatse tüübituletuse (compile-time),
- runtime-valideerimise päringu parameetritele (path, query, body) ja vastuste struktuurile.

See topeltkasutus elimineerib vajaduse eraldi tüübifailide ja valideerimiskoodi järele – üks skeem toimib nii tüübi- kui valideerimiskirjeldusena.

### Talletusinfrastruktuur

Talletuskiht realiseerib keeleteülese püsitalletuse RocksDB LSM-tree arhitektuuri peal, mis sobib hästi ajarealaadsete (time-series) andmete kiireks järjestikliseks kirjutamiseks ja indekseeritud lugemiseks.

#### Rust RocksDB bindingud

Pakk `rust-rocksdb-napi` pakub RocksDB bindinguid, mis on kirjutatud Rustis ja:

- kasutavad Node.js integratsiooniks NAPI-RS-i (N-API),
- kasutavad Pythoniga integreerimiseks Maturin + PyO3 kombinatsiooni.

Seega saavad nii TypeScripti kui Pythoni teenused kasutada sama talletusinfrastruktuuri.

Custom-implementatsioon oli vajalik, kuna olemasolevad keelespetsiifilised RocksDB teegid (nt node-rocksdb, python-rocksdb) on kas hooldamata või ei toeta vajalikke funktsioone (nt secondary instantsid). Implementatsioon pakub:

- SegmentedLog abstraktsiooni järjestikuste append-operatsioonidega ajareade jaoks,
- LZ4 ja Zstd kompressiooni,
- primary/secondary instantside mustrit, mis võimaldab paralleelset lugemist ilma kirjutusi blokeerimata,
- iteratoripõhist partiidem lugemist konfigureeritava batch-suurusega,
- logi truncation operatsioone ajaloolise andmehulga kiireks puhastamiseks.

**Primary/secondary instantside muster** on RocksDB puhul eriti oluline arhitektuuriline lahendus, kuna tegemist on põhimõtteliselt embedded (faili- ja protsessipõhise) andmebaasiga, mitte tsentraliseeritud serveriga nagu PostgreSQL. Tsentraalsed andmebaasid pakuvad mitut samaaegset ühendust ühe serveriprotsessi kaudu, mis haldab konkureerivat ligipääsu sisemiselt. RocksDB on aga mõeldud otseseks integreerimiseks rakenduse protsessi, kus iga protsess kasutab andmebaasi otseselt failisüsteemi kaudu. Ilma primary/secondary mustrita oleks võimatu saavutada samaaegseid lugemisi ja kirjutusi erinevates protsessides blokeeringuteta. Primary instants võimaldab kirjutamisoperatsioone, samal ajal kui mitmed read-only secondary instantsid saavad samu andmeid paralleelselt lugeda. See eraldus tagab, et ajalooliste andmete taasesitus arenduses ei sega reaalajas andmete sissevõttu ega mõjuta kirjutamisoperatsioonide jõudlust.

#### Kõrgema taseme talletuskiht

Pakk `persistent-storage-node` on kõrgema taseme TypeScripti talletuskiht, mis pakub **entiteedipõhiseid** abstraktsioone REST vastuste ja WebSocket sõnumite talletamiseks. Pakk defineerib per-endpoint talletus-entiteedid erinevatele allikatele, sh:

- Binance’i ja Kraken’i ajaloolised tehingud,
- orderbook’id,
- depth-stream’id,
- ticker-stream’id.

Entiteedid rakendavad automaatset alamindeksite haldust (nt sümboli ja ajatempli põhjal), võimaldades:

- efektiivseid päringuid,
- selektiivset andmete lugemist.

Andmetransformaatorid teisendavad platvormispetsiifilised formaadid ühtseteks skeemideks – nt ühtlustatud trade'id (normaliseeritud väljad üle börside) ja ühtlustatud orderbook'id (standardiseeritud bid/ask struktuur), mis lihtsustab platvormiagnostilist töötlust.

#### Talletusbackend'i evolutsioon

Lõplik RocksDB-põhine arhitektuur elimineerib vajaduse hallata hajusbrokerite klastreid (nt ZooKeeper + Kafka, partitsioonide rebalance jms), kuid säilitab oluline streaming-semantika SegmentedLog abstraktsiooni kaudu:

- järjestikune sündmuste kord,
- offset-põhine tarbimine,
- primary/secondary instantside muster paralleelseks lugemiseks.

Disain on kujunenud välja mitme alternatiivse lahenduse katsetamise tulemusel, kus iga järgmine samm lahendas eelmise lahenduse kitsaskohti.

1. **JSONL (newline-delimited JSON)**  
   Pluss:
   - inimsõbralik formaat,
   - lihtne append-only semantika.

   Miinus:
   - suur kettakasutus (kompressiooni puudumine),
   - efektiivne juhuslik lugemine nõuab käsitsi byte-offset indeksit; ilma selleta muutub ligipääs O(n) operatsiooniks.

2. **SQLite**  
   Pluss:
   - parem kettakasutus tänu sisemistele optimeerimistele.

   Miinus:
   - isegi 5 sümboli korral kahe platvormi kohta kasvas andmemaht üle 10 GB päevas,
   - tabelite truncation (miljonite ridade kustutamine) võttis kümneid minuteid; selle aja jooksul kirjutused blokeeriti globaalse write lock'i tõttu. See tegi ajalooliste andmete puhastamise reaalajas sissevõtu jaoks liiga häirivaks.

3. **RocksDB LSM-tree**  
   Lahendus:
   - sisseehitatud kompressioon (LZ4, Zstd), mis vähendab seeriandmete mahtu,
   - efektiivne vahemiku kustutamine (range deletion) compaction'i kaudu – truncation on sisuliselt märgistus, tegelik puhastus toimub taustal,
   - write-optimiseeritud järjestikune append, mis ei blokeeri lugemisi primary/secondary mustri tõttu.

#### Jõudluskarakteristikud

RocksDB LSM-tree arhitektuur on optimeeritud just selliste write-intensive ajarealistete andmete jaoks, nagu on krüptobörside kõrgsageduslikud turuandmed. LSM-puu konverterib juhuslikud kirjutused järjestikusteks append-operatsioonideks, vältides andmebaasi fragmenteerumist ja vähendades write amplification'it võrreldes traditsiooniliste B-tree põhiste lahendustega.

Käesoleva süsteemi kontekstis on RocksDB valik eriti sobiv tänu järgmistele omadustele:

- **Write-optimeeritud arhitektuur:** LSM-puu järjestikused append-operatsioonid sobivad ideaalselt pidevate WebSocket voogude salvestamiseks,
- **Kompressioon:** Sisseehitatud LZ4/Zstd kompressioon vähendab seeriandmete mahtu oluliselt,
- **Range deletion:** Ajalooliste andmete puhastamine (truncation) on efektiivne tänu compaction mehhanismile,
- **Primary/secondary muster:** Võimaldab paralleelseid lugemisi ilma kirjutusi blokeerimata.

**Arhitektuuriline isolatsioon.** Oluline arhitektuuriline valik on, et iga sümbol ja entiteet talletatakse eraldi RocksDB instantsis (eraldi kataloogis/failis). See tähendab näiteks, et Binance BTCUSDT order book diff'id, BTCUSDT trade'id ja ETHUSDT order book diff'id on igaüks oma RocksDB andmebaasis. See isolatsioon toob kaasa mitu jõudluseelist:

- **Madal kirjutamise latentsus**: RocksDB saavutab kirjutamislatentsusi mediaanina ~4,5 μs (mikrosekundit) ja p95 ~2100 μs (https://tidesdb.com/articles/tidesdb-vs-rocksdb/). Ühe sümboli kõrge kirjutamissagedus ei mõjuta teiste sümbolite kirjutamisi, kuna puudub konkurents ühise ressursi (lock, memtable, WAL) üle,
- **Paralleelne compaction**: Iga RocksDB instants saab sooritada compaction'i sõltumatult, kasutades täielikult ära mitmetuumalisi protsessoreid,
- **Isoleeritud ebaõnnestumine**: Ühe sümboli andmebaasi korruptsiooni või probleem ei mõjuta teiste sümbolite andmeid,
- **Selektiivne lugemine**: Arenduse või testimise ajal saab laadida ainult vajalike sümbolite andmeid, vähendades mälu- ja I/O koormust.

**Kompressiooni efektiivsus.** Käesoleva süsteemi implementatsiooni käigus täheldati, et toores JSONL failide salvestamine (ilma kompressioonita) võttis ~10 GB ruumi, SQLite ~20GB, samas kui RocksDB sama andmehulk oli ~2 GB (5-10x väiksem). See erinevus tuleneb kahe teguri kombinatsioonist:

SST-failide kompressioon: Püsivad SST (Sorted String Table) failid kompresseeritakse plokitasemel (block-level compression), kus iga plokk (tavaliselt 4KB) kompresseeritakse eraldi. Kompressiooni algoritmi saab määrata `options.compression` kaudu, vaikimisi kasutatakse Snappy't, kuid soovitatakse LZ4 või Zstd. Erinevatel LSM-puu tasemetel (levels) saab kasutada erinevaid kompressioone – näiteks alumistel tasemetel (bottommost level), kus andmed on stabiilsemad, kasutatakse sageli tugevamat Zstd kompressiooni.

Write-Ahead Log (WAL) failide kompressioon: kasutab voo-kompressiooni (streaming compression), mis leiab korduvaid fraase üle mitme kirje (eriti oluline JSON puhul), saavutades paremaid kompressiooniasteid kui plokipõhine kompressioon.

Compaction protsess: Lisaks kompressioonile vähendab LSM-puu compaction protsess andmemahtu eemaldades duplikaatsed võtmed (uuemad versioonid kirjutavad üle vanemad), kustutatud kirjed (tombstones) ja aegunud versioonid.

Viited: https://github.com/facebook/rocksdb/wiki/Compression, https://github.com/facebook/rocksdb/wiki/WAL-Compression

**Läbilaskevõime ja jõudlusnumbrid.**

RocksDB ametlik dokumentatsioon (https://rocksdb.org/) ja benchmark'id (https://github.com/facebook/rocksdb/wiki/Performance-Benchmark-201807, https://tidesdb.com/articles/tidesdb-vs-rocksdb/) näitavad märkimisväärseid jõudlusnäitajaid:

Läbilaskevõime:

- **Järjestikused kirjutused**: kuni 335,7 MB/s (optimaalne käesoleva süsteemi append-only mustri jaoks),
- **Juhuslikud kirjutused**: ~595 000 ops/s (üks lõim),
- **Juhuslikud lugemised**: ~1 920 000 ops/s.

Latentsus:

- **Kirjutamise mediaanlatentsus**: ~4,5 μs (mikrosekundit),
- **Kirjutamise p95 latentsus**: ~2,1 ms (millisekundit),
- **Lugemise mediaanlatentsus**: ~1,9 μs,
- **Lugemise p99.9 latentsus**: ~22 μs.

Praktilises kontekstis tähendab järjestikuste kirjutuste läbilaskevõime, et tüüpilise order book diff update sõnumi suurusega (~1,2 KB JSON) ja kompressiooniga (3-4x) suudab RocksDB kirjutada ligikaudu **840 000 sõnumit sekundis**. See on üle 800 korra suurem kui tegelik vajadus mitme kümnete sümbolite paralleelsel jälgimisel (nt 100 sümbolit × 10 update/s = 1000 sõnumit/s), pakkudes märkimisväärset reservi tipptundide voo intensiivsuse korral.

### Protsessidevaheline sõnumside

Protsessidevaheline sõnumside (IPC) on realiseeritud ZeroMQ baasil, mis pakub suure jõudlusega asünkroonset sõnumivahetust Node.js teenuste vahel. ZeroMQ-l on madalam latentsus ja suurem läbilaskevõime kui traditsioonilistel TCP-põhistel message broker'itel, mistõttu sobib see hästi kõrgsageduslikeks turuandmete voogudeks. ZeroMQ IPC transport võimaldab saavutada mitmeid miljoneid sõnumeid sekundis mikrosekundiliste latentsustega, kui publisher ja subscriber töötavad samas masinas. Tüüpiline IPC latentsus on **~30-50 μs** (mikrosekundit) roundtrip ajana (https://zguide.zeromq.org/). See jõudlus tuleneb ZeroMQ asünkroonsest I/O mudelist ja lock-free algoritmidest, mis elimineerivad traditsiooniliste broker-põhiste süsteemide (nagu RabbitMQ) keskse koordineerimise overhead'i.

**Determinismi tagamine pub/sub mustris**: Oluline märkus on, et ZeroMQ pub/sub muster ei garanteeri sõnumite kohaletoimetamist (no guaranteed delivery) – kui subscriber pole hetkel ühendatud või ei jõua sõnumeid piisavalt kiiresti töödelda, võivad mõned sõnumid kaduda. Süsteemi determinismi ja andmete terviklikkuse tagamiseks rakendavad consumerid järjestikuste identifikaatorite kontrolli: iga saabunud sõnumi sequential ID võrreldakse eelmise sõnumi ID-ga. Kui tuvastatakse vahe (gap) järjestuses, näitab see sõnumi(te) kaotsiminekut pub/sub kanali kaudu. Sellisel juhul täidab consumer automaatselt puuduvad sõnumid RocksDB secondary read-only instance'i kaudu, lugedes need otse talletusest offset'i järgi. See hübriidne lähenemine ühendab ZeroMQ kiire reaalajas edastuse eelised (low-latency streaming) RocksDB garanteeritud püsivuse ja täielikkusega (durability and completeness), tagades et downstream töötlus saab alati täieliku ja järjestatud andmevooga isegi siis, kui pub/sub kanal ajutiselt ebaõnnestub.

#### Sõnumside implementatsioon

Pakk `messaging-node` teostab ZeroMQ pub/sub mustri, pakkudes:

- publisher ja subscriber abstraktsioone,
- registripõhist lähenemist mitme stream’i haldamiseks.

Publisher:

- hoiab järjekorda (queue), kui sokkel on hõivatud,
- toetab asünkroonset saatmist ja kuni 100 sõnumi batch’e,
- serialiseerib talletus-recordid JSON-iks.

Subscriber:

- pakub async-iterator liidest sõnumite tarbimiseks (sobib hästi kaasaegse `for await ... of` mustriga),
- deserialiseerib JSON payload’id automaatselt,
- kasutab sokli-templeid (socket templates), kus IPC sokli tee genereeritakse platvormi ja sümboli põhjal.

Registri muster võimaldab selektiivset tellimist: näiteks saab consumer ühendada ainult Binance BTCUSDT tehingu-streamile, ilma Kraken'i või teiste sümbolite stream'ideta. See vähendab nii võrgu kui ressursi overhead'i.

### Võrdlus hajutatud sõnumisidega: RocksDB+ZeroMQ vs Apache Kafka

Traditsiooniline lähenemine reaalajas turuandmete voogude haldamiseks hõlmab hajutatud sõnumivahetuse platforme nagu Apache Kafka. Käesolev süsteem kasutab selle asemel RocksDB püsitalletuse ja ZeroMQ IPC kombinatsiooni. See arhitektuuriline valik toob kaasa olulised jõudluseelised ühemasinasel (single-machine) juurutustel.

**Apache Kafka latentsus ja omadused:**

Apache Kafka on laialdaselt kasutatav hajutatud sõnumivahendussüsteem, mis on optimeeritud suure läbilaskevõimega andmevoogude töötlemiseks klastrikeskkonnas. Kafka latentsus (https://arxiv.org/abs/2510.04404):

- **p95 latentsus**: ~18 ms (18 000 μs)
- **Latentsuse vahemik**: 5-200 ms (sõltuvalt partitsioonide arvust ja koormusest)
- **Läbilaskevõime**: kuni 1,2 miljonit sõnumit/s (klastrikonfiguratsioonist sõltuvalt)

Kafka latentsus koosneb mitmest etapist: producer serialiseerimine, võrguedastus (TCP) broker'ile, kettale kirjutamine, replikatsioon (kui konfigureeritud), võrguedastus (TCP) consumer'ile ja deserialiseerimine.

**RocksDB + ZeroMQ latentsus:**

Käesoleva süsteemi arhitektuuris kulgeb sõnumi elutsükkel järgmiselt:

1. **RocksDB kirjutamine**: ~4,5 μs (mediaanlatentsus)
2. **JSON serialiseerimine**: ~1-3 μs
3. **ZeroMQ IPC kirjutamine** (publisher → IPC socket): ~30-50 μs
4. **ZeroMQ IPC lugemine** (IPC socket → subscriber): ~30-50 μs
5. **JSON deserialiseerimine**: ~1-3 μs

**Kogulatentsus** (end-to-end): ~67-111 μs (mediaanina ~90 μs)

**Ideaalstsenaarium: Custom mmap (Chronicle Queue sarnane):**

Java Chronicle Queue (https://chronicle.build/queue/) kasutab memory-mapped faile (mmap), et saavutada veelgi madalamat latentsust kui RocksDB. Mälukaardistamine võimaldab kirjutada andmeid otse OS kernel'i poolt hallatavasse mälupuhvrisse, vältides kasutajaruumi ja kernel'i vahelisi kontekstilülitusi ning pakkudes peaaegu otsesat kettale ligipääsu.

Chronicle Queue latentsus:

- **p99.99 latentsus**: alla 40 μs (mitme teenuse vahel IPC)
- **Tüüpiline kirjutamine**: ~1-5 μs
- **Lugemine**: mikrosekundi tasemel

Selline lähenemine on ideaalne latentsusele orienteeritud süsteemides (nt high-frequency trading), kuid nõuab:

- Täiendavat arendusressurssi custom bindings'ite loomiseks,
- Spetsiifilist mälu haldust (off-heap, page cache juhtimine),
- Hoolikat konfigureerimist OS tasandil (hugepages, file system valikud).

**Võrdlus:**

| Mõõdik                    | Kafka           | RocksDB + ZeroMQ | Chronicle Queue (ideaal) | RocksDB vs Kafka | Chronicle vs RocksDB |
| ------------------------- | --------------- | ---------------- | ------------------------ | ---------------- | -------------------- |
| Mediaanlatentsus          | ~18 000 μs      | ~90 μs           | ~1-5 μs                  | **200x kiirem**  | **18-90x kiirem**    |
| Läbilaskevõime            | 1,2M sõnumit/s  | ~840K sõnumit/s  | Miljoneid ops/s          | Võrreldav        | Kõrgem               |
| Arenduse keerukus         | Keskmine        | Madal            | Kõrge                    | -                | -                    |
| Operatsiooniline overhead | Kõrge (klaster) | Madal            | Madal                    | -                | -                    |

**Arhitektuurilised kompromissid:**

Kafka eelised:

- **Klastri skaleeritavus**: Kafka on optimeeritud mitme masina klastritele, võimaldades horisontaalset skaleerimist,
- **Geograafiline replikatsioon**: Sisseehitatud tugi andmete replikatsiooniks eri andmekeskuste vahel,
- **Kauakestvad vood**: Võimaldab säilitada sõnumeid pikemaks ajaks (päevad, nädalad) ja uuesti tarbida,
- **Ökosüsteem**: Lai tugi erinevate klientide ja integratsioonide näol.

RocksDB + ZeroMQ eelised:

- **Väga madal latentsus**: 75-210x kiirem kui Kafka ühemasinasel juurutusel,
- **Operatsiooniline lihtsus**: Ei vaja ZooKeeper'it, Kafka broker'eid ega partitsioonide rebalance'i,
- **Deterministlik taasesitus**: RocksDB sekundaarne read-only instants võimaldab täpset offset-põhist taasesitust,
- **Ressursisäästlik**: Väiksem mälu- ja CPU koormus võrreldes Kafka klastriga,
- **Küps ökosüsteem**: Stabiilsed Node.js ja Python bindingud, hea dokumentatsioon.

Chronicle Queue (mmap) eelised:

- **Äärmiselt madal latentsus**: 1-5 μs mediaanlatentsus, alla 40 μs p99.99 (18-90x kiirem kui RocksDB),
- **Kõrge läbilaskevõime**: Miljoneid operatsioone sekundis tänu otsesele mälupuhvri ligipääsule,
- **Zero-copy operatsioonid**: Mälukaardistamine elimineerib andmete kopeerimise kernel-userspace vahel,
- **Deterministlik jõudlus**: Off-heap mälu vähendab GC (garbage collection) mõju (Javas).

Chronicle Queue (mmap) puudused:

- **Arenduse keerukus**: Nõuab custom native bindings'eid või Java interop'i (JNI overhead TypeScript/Python puhul),
- **Mälu haldus**: Vajab hoolikat OS-tasandi konfigureerimist (hugepages, page cache, file system valikud),
- **Ökosüsteemi piiratus**: Peamiselt Java keskkonnale optimeeritud, vähem küpsed alternatiivid teistele keeltele,
- **Debugging keerukus**: Mälukaardistatud failide probleemide diagnoosimine on keerulisem kui standardse I/O puhul.

**Kasutus käesoleva süsteemi kontekstis:**

Käesoleva süsteemi nõuded (ühemasinasel arendus- ja testimiskeskkonnas, deterministlik offline taasesitus, madal latentsus) sobivad ideaalselt RocksDB + ZeroMQ arhitektuuriga. See esindab pragmaatilist tasakaalu jõudluse, arenduse keerukuse ja ökosüsteemi küpsuse vahel:

**Miks mitte Kafka:**

1. Ühe masina protsessor suudab käsitleda 100+ sümboli voogusid (reserv ~800x),
2. Deterministlik arendus nõuab kohalikku talletust, mitte hajutatud klastrit,
3. Masinõppe mudeli treenimine toimub offline, mitte reaalajas,
4. Kafka 18 ms latentsus vs RocksDB 90 μs – 200x aeglasem.

**Miks mitte Chronicle Queue (custom mmap):**

1. RocksDB 90 μs latentsus on piisav (order book update'id tulevad 100 ms intervalliga),
2. **Mmap keerukus**: Memory-mapped failide haldus on väga keeruline nii OS tasemel (page cache, hugepages, file system valikud, flush poliitikad) kui ka shared memory süsteemide tasandil (mitme protsessi sünkroniseerimine, memory barrier'id, cache coherency). See nõuab süvateadmisi kernel'i käitumisest ja võib tuua kaasa raskesti debugitavaid probleeme (silent corruption, segmentation faults, performance cliffs). CMU uuring "Are You Sure You Want to Use MMAP in Your Database Management System?" (https://db.cs.cmu.edu/papers/2022/cidr2022-p13-crotty.pdf) demonstreerib, et mmap ei ole andmebaaside jaoks nii lihtne lahendus kui võiks arvata,
3. Arendusressurss kulub efektiivsemalt ML mudeli arendusele, mitte infrastruktuuri optimeerimisele,
4. RocksDB + ZeroMQ ökosüsteem on küps ja hästi dokumenteeritud TypeScript/Python jaoks,
5. Täiendav 18-90x latentsuse vähendamine ei too praktilist kasu offline taasesituses.

### Võrdlus: hajutatud teenused vs monoliitiline protsess

Käesolev süsteem kasutab **hajutatud arhitektuuri**, kus erinevad komponendid (WebSocket consumerid, REST fetcherid, transformerid, window workerid, predictorid) töötavad **eraldi protsessidena** ja suhtlevad omavahel ZeroMQ IPC kaudu. Alternatiiviks oleks **täiesti monoliitiline protsess**, kus kõik komponendid töötaksid ühes protsessis.

**Täiesti monoliitiline arhitektuur: omadused**

Monoliidis töötaksid kõik komponendid (WS consumer, fetcher, transformer, predictor) ühe protsessi sees, jagades mälu ja suheldes otse funktsioonikutsete kaudu

Eelised:
- **Minimaalne latentsus**: Protsessisisene suhtlus on nanosekundites, IPC puudub,
- **Lihtne debugging**: Üks stack trace, kõik on ühes kohas,
- **Vähem liikuvaid osi**: Puudub IPC konfigureerimine ja soklite haldus.

Puudused:
- **Deployment-i granulaarsuse puudumine**: Ühe komponendi uuendamiseks tuleb kogu protsess taaskäivitada, katkestades kõiki funktsioone,
- **Ressursside isoleerimine puudub**: Memory leak ühes komponendis võtab maha kogu süsteemi,
- **Arendusprotsessi kitsaskohad**: Mitme arendaja töö võib tekitada konflikte, kuna kõik on ühe koodibaasi osas.

**Käesoleva süsteemi osaliselt hajutatud arhitektuur**

Eelised:
- **Granulaarne deployment**: Ainult ühe protsessi taaskäivitamine, teised jätkavad tööd,
- **Ressursside isoleerimine**: Ühe protsessi probleem (crash, memory leak) ei mõjuta teisi,
- **Paralleelne arendus**: Eri komponente saab arendada sõltumatult, kuna liides on defineeritud,
- **Sõltumatu käivitamine**: Eri komponente saab arenduse käigus eraldi käivitada — näiteks kui turuandmed on juba kogutud, saab keskenduda ML mudeli ehitamisele või uute feature'ide arendamisele ilma andmekogumisprotsesse käivitamata.

Puudused vs monoliit:
- **IPC overhead**: ZeroMQ latentsus (~30-50 μs) vs protsessisisene (~nanosekundid),
- **Keerukam debugging**: Mitme protsessi logide korreleerimine, distributed tracing vajadus; samas lihtsam isoleeritud debugging, kuna saab üksikut komponenti eraldi käivitada ja testida,
- **IPC konfigureerimine**: Socket'ide ja topic'ute defineerimine nõuab täiendavat konfiguratsiooni.

Osaliselt hajutatud arhitektuur pakub monoliidi suhtes olulist paindlikkust: granulaarne deployment võimaldab uuendada üksikuid komponente ilma kogu süsteemi katkestamata, ressursside isoleerimine kaitseb süsteemi ühe protsessi probleemide eest ning komponentide skaleerimine võimaldab vastavalt vajadusele lisada muid protsesse. IPC overhead (~30-50 μs protsessidevahelise suhtluse latentsus) on aktsepteeritav hind nende eeliste eest, eriti võrreldes monoliidi riskidega, kus ühe komponendi viga võib kaasa tuua kogu süsteemi katkemise.

### Jagatud infrastruktuur

Jagatud infrastruktuur koondab üldised utiliidid ja konfiguratsioonihalduse, mida kasutavad kõik rakendused ja paketid.

#### Utiliidid

Pakk `utils` sisaldab korduvkasutatavaid utiliitfunktsioone, sh:

- eksponentsiaalne backoff retry loogika (`tryHard`), kus saab konfigureerida:
  - esialgset viivitust,
  - maksimaalset viivitust,
  - backoff kordajat;
- asünkroonsed koordineerimisprimitiivid:
  - promise-lock’id sünkroniseerimiseks,
  - event loop’i “yield’imine”, et vältida event loop’i blokeerimist;
- kollektsioonide abifunktsioonid:
  - massiivide muutmine multimap’iks grupeerimisoperatsioonide jaoks;
- tüübi-kaitsjad (type guards):
  - nil-check’id,
  - turvaline JSON stringifikatsioon, mis käsitleb serialiseerimisvigu.

#### Konfiguratsioonihaldus

Pakk `config` koondab monorepo-ülesed konfiguratsioonifailid, et tööriistad käituks ühtemoodi:

- ESLint reeglid (koodikvaliteedi kontroll),
- Prettier reeglid (ühtne koodiformaat),
- TypeScripti baaskonfiguratsioon (common compiler options),
- Vitest testikonfiguratsioon.

See tsentraliseerimine vähendab konfiguratsiooni hoolduskulu ja tagab ühtlase stiili kõigis TypeScript/JavaScript pakettides, ka uutes, mis monoreposse lisatakse.

#### Jälgitavuse infrastruktuur

Jälgitavus on realiseeritud **Dashboard-as-Code** põhimõttel, kasutades Perses + VictoriaMetrics kombinatsiooni protsesside mälu, custom-mõõdikute ja süsteemse telemeetria jälgimiseks. See demonstreerib, et deklaratiivne jälgitavuse konfiguratsioon toimib nii arendus- kui produktsioonikeskkonnas.

Armatuurlaudade definitsioonid hoitakse samas versioonihalduses kui rakenduskood. See tagab:

- reprodutseeritavad dashboard'ide juurutused,
- jälgitavuse konfiguratsiooni evolutsiooni kooskõlla süsteemi arhitektuurimuutustega.

See kontrastib käsitsi ehitatud dashboard'idega veebiliidese kaudu, kus konfiguratsioon tihti driftib ja võib infrastruktuuri uuesti ülesehitamisel kaduma minna.

## Arhitektuursed mustrid

Süsteemi arhitektuur kasutab mitut korduvat mustrit, mis lahendavad üldisi probleeme eri komponentides.

### Skeemipõhine tüübikindlus

Endpoint’i definitsioonid kirjeldavad TypeBoxi abil eksplitsiitselt:

- HTTP path’e,
- meetodeid,
- query parameetreid,
- request body’t,
- response skeeme.

See skeemipõhine lähenemine pakub:

- compile-time tüübikindlust (TypeScripti tüübituletus),
- runtime-valideerimist (kompileeritud TypeBoxi validaatorid).

Runtime’is kontrollib validaator, et API vastus vastab skeemile (väljade olemasolu, tüübid, liigsed väljad). TypeScripti poolel annab skeem automaatselt tüübid, mis võimaldab:

- IDE autocomplete’i,
- compile-time vigade avastamist,
- ohutut refaktoreerimist ilma lisakoodi genereerimata.

Nii välditakse vajadust pidada eraldi:

- tüübide definitsioone,
- validaatoreid.

Kõik on koondatud ühte skeemikihti.

### Entiteedipõhine talletusabstraktsioon

Talletus-entiteedid kapseldavad platvormispetsiifiliste API vastuste talletusloogika eri kombinatsioonidele:

- platvorm (Binance vs Kraken),
- andmetüüp (REST vs WebSocket).

Iga entiteet:

- kasutab normaliseeritud alamindeksite nimetamise konventsioone,
- ekstraheerib ajatempli platvormispetsiilse formaadi seest,
- kasutab batch-operatsioone, et optimeerida write-throughput’i kõrgsagedusliku andmesissevoolu korral.

Nii saavad tarbijad suhelda talletusega ühtse liidese kaudu, mis peidab platvormispetsiifilised detailid ja talletuse organiseerimise eripärad.

### Registrimuster IPC jaoks

Publisher’i ja subscriber’i registrid haldavad ZeroMQ soklite kogumeid, kasutades templatega endpoint’ide generatsiooni. Registrimuster võimaldab:

- dünaamilist stream’i valikut runtime’is,
- teenustel tellida ainult vajalikke vooge,
- muuta ühendustopoloogiat ilma teenust uuesti juurutamata.

Näiteks prediktsiooni-worker saab tellida ainult Binance BTCUSDT tehingud, kasutades vastavat templati. ETHUSDT lisamine tähendab vaid uue templatikutsungi lisamist sümboli ID-ga; worker ise ei vaja koodimuudatusi ega uusi konfiguratsioonifaile.

### Platvormi laiendatavus

Uute krüptobörside lisamine nõuab minimaalselt tööd tänu arhitektuuri lahutusele ja üldistele abstraktsioonidele. Laiendatavus tugineb põhimõttele, et platvormispetsiifilised detailid on isoleeritud ühtsete liideste taha, võimaldades uute börsside integratsiooni standardiseeritud mustrite kaudu.

**Skeeemipõhine liideste definitsioon**: Uue börsi integratsioon algab API skeemide deklaratiivse kirjeldamisega, kus määratletakse päringu parameetrid, vastuste struktuurid ja sõnumiformaadid nii REST kui WebSocket protokollide jaoks. Need skeemid toimivad nii compile-time tüübikontrolli kui runtime valideerimise alusena, tagades et platvormispetsiifilised andmeformaadid on täpselt dokumenteeritud ja automaatselt valideeritavad.

**Protsessipõhine isolatsioon**: Iga börs töötab eraldiseisva teenusprotsessina, mis haldab ainult sellele platvormile omast ühenduslogikka ja andmevoogu. See arhitektuuriline eraldus tagab, et ühe börsi ühenduse probleemid või konfiguratsioonimuutused ei mõjuta teiste börside töö stabiilsust. Protsessidevaheline side toimub ühtse sõnumsideliidese kaudu, kus iga platvormi sõnumivood on selgelt identifitseeritavad templated-põhise nimetamisskeemi järgi.

**Geneerilised talletusabstraktsioonid**: Andmete püsivustamine kasutab geneerilisi factory-funktsioone, mis võtavad sisendiks platvormispetsiifilise skeemi definitsiooni ja genereerivad automaatselt tüübiturvalised talletusliideste. TypeScripti tüübisüsteemi generikud võimaldavad luua platvormiagnostilisi talletusoperatsioone, kus talletuse loogikat ei pea iga uue börsi jaoks eraldi implementeerima – piisab skeemi deklareerimisest ja generilise tehase väljakutsumisest.

**Koodi taaskasutus läbi jagatud infrastruktuuri**: Platvormi implementatsioonid on omavahel isoleeritud, jagades ainult ühiseid infrastruktuurikihte: teenuseraamistik (lifecycle, logging, metrics), talletuskiht (persistence abstractions) ja sõnumsidekiht (messaging patterns). See eraldus võimaldab mitmel arendajal töötada paralleelselt eri börsside integratsioonidega ilma koordinatsioonivajaduseta, kuna ühiste komponentide API-d on stabiilsed ja platvormist sõltumatud. Uue platvormi lisamine ei nõua olemasolevate implementatsioonide (Binance, Kraken) muutmist ega testimist, vähendades regressiooniohtu ja kiirendades arendusprotsessi.

## Deterministlik offline-arendus

RocksDB-põhine talletus koos **SegmentedLog** abstraktsiooniga võimaldab süsteemil töötada täielikult offline režiimis ilma väliste teenusteta. See on kriitiline nii arenduskeskkonna stabiilsuse kui ka masinõppemudelite reprodutseeritavuse seisukohalt.

Ajaloolised turuandmed (REST API vastused ja WebSocket vood) talletatakse järjestikuliste append-operatsioonidega, mis on optimeeritud ajareade (time-series) jaoks. Talletus on organiseeritud hierarhiliselt platvormi, endpoint'i ja sümboli indeksite järgi, nii et tekib deterministlik andmekogum, mida saab mitmes arendusiteratsioonis identsetel tingimustel uuesti läbi mängida.

RocksDB **primary/secondary** instantside muster võimaldab kirjutada andmeid primary instantsi kaudu, samal ajal kui mitmed read-only secondary instantsid saavad samu andmeid paralleelselt lugeda ja taasesitada. See eraldus tagab, et ajalooliste andmete taasesitus arenduses ei sega reaalajas andmete sissevõttu ega mõjuta kirjutamisoperatsioonide jõudlust.

Arenduse käigus saab talletatud ajaloolisi andmeid taasesitada iterator-põhiselt koos offset'i haldusega. internal-bridge ja allavoolu prediktsiooni-worker'id töötlevad igas iteratsioonis täpselt sama sündmuste jada, mis tagab:

- deterministliku andmetransformatsiooni testimise,
- usaldusväärse feature engineering'u pipeline'i valideerimise.

### Olulisus masinõppe arenduses

Masinõppe mudelite arenduses on selline determinism eriti tähtis: nii feature'ite arvutamine kui ka mudeli hindamine peavad põhinema täpselt samadel andmejadadel, et mudelite võrdlus oleks aus. Mudelite võrdlus eri feature set'ide või algoritmiliste variantide vahel eeldab, et sisendandmed on identsed; vastasel juhul seguneb mudeli muutuse efekt andmete varieeruvusega.

See lähenemine elimineerib elava andmevoo nondeterminismi: erinevad saabumisajad, võrgutõrked, börsi seisakud jne. Kontrollitud testkeskkond võimaldab valideerida:

- andmetransformatsiooni loogikat,
- offset'i haldust,
- tarbijavoogude (consumer stream) semantikat,

ilma sõltuvuseta välisest infrastruktuurist ja ilma korduvate API päringute rate limit'i kuludeta.

## Andmevood ja süsteemi integreeritus

Täielik andmevoog liigub välistelt krüptobörsidelt läbi mitme töötlemisetapi kuni lõplike prediktsioonideni:

1. andmed saabuvad **external-bridge** teenuse kaudu,
2. need normaliseeritakse ja voogusid hallatakse **internal-bridge** teenuses,
3. andmed talletatakse RocksDB-sse,
4. ZeroMQ pub/sub jagab andmeid edasi reaal-ajas,
5. **py-predictor** kasutab andmeid mudelite treenimiseks ja reaalajas ennustamiseks.

Arhitektuur rakendab selget vastutuse eraldamist:

- **Teenuseraamistik** käsitleb ristuvaid operatsioonilisi teemasid – observability, konfiguratsioon, protsessi elutsükkel – ühtselt nii Node.js kui Pythoni teenustes.
- **API kliendi kiht** abstraheerib börsiga suhtluse skeemipõhise valideerimise ja tüübiturvaliste liidestega, isoleerides allavoolu komponendid protokollispetsiifilistest detailidest.
- **Talletusinfrastruktuur** pakub keeleteülese RocksDB-põhise püsitalletuse, entiteedipõhised abstraktsioonid ja transformatsioonipipeline’id efektiivseks andmepäringuks.
- **Sõnumside kiht** kasutab ZeroMQ pub/sub mustrit selektiivse stream’i tellimisega, vähendades võrgu overhead’i.
- **Jagatud infrastruktuur** (utiliidid ja konfiguratsioon) tagab ühtse stiili ja käitumise kogu polüglotse koodibaasi ulatuses.

Kokkuvõttes realiseerib see kihiline arhitektuur Kafka-sarnase streaming-semantika – järjestatud tarbimine, offset’i jälgimine, taasesitus – RocksDB peale, ilma hajusbrokerite kompleksuseta. Nii saavutatakse streaming-süsteemide omadused, säilitades samal ajal piisava operatsioonilise lihtsuse üksikmasina juurutuste ja arenduskeskkondade jaoks.

## Tehnoloogiad ja tööriistad

Allpool on viited kõigile süsteemis kasutatavatele tehnoloogiatele, raamistikkele, teekidele ja tööriistadele.

**Paketi haldus ja build-tööriistad**

- pnpm - https://pnpm.io/ - kiire ja kettaruumisäästlik pakettihaldur
- npm - https://www.npmjs.com/ - Node.js pakettihaldur

**Programmeerimiskeeled ja runtime’id**

- TypeScript - https://www.typescriptlang.org/ - tüübitud JavaScripti superset
- Node.js - https://nodejs.org/ - JavaScripti runtime
- Python - https://www.python.org/ - kõrgtaseme programmeerimiskeel
- Rust - https://www.rust-lang.org/ - süsteemse programmeerimise keel

**Pythoni toolchain**

- uv - https://github.com/astral-sh/uv - kiire Pythoni paketi paigaldaja ja resolver
- Ruff - https://github.com/astral-sh/ruff - kiire Pythoni linter ja formatter
- Pydantic - https://docs.pydantic.dev/ - andmevalideerimise teek, mis kasutab Pythoni tüübimärgistust

**Rust build-tööriistad**

- Cargo - https://doc.rust-lang.org/cargo/ - Rusti pakettihaldur ja build-süsteem
- NAPI-RS - https://napi.rs/ - raamistik Node.js lisamoodulite (addons) ehitamiseks Rustis
- Maturin - https://github.com/PyO3/maturin - Rust-põhiste Pythoni pakettide ehitamine ja avaldamine
- PyO3 - https://pyo3.rs/ - Rusti bindingud Pythoni jaoks

**TypeScript/JavaScript tööriistad**

- tsx - https://github.com/privatenumber/tsx - tööriist TypeScript-failide otse käivitamiseks
- TypeBox - https://github.com/sinclairzx81/typebox - JSON Schema tüübi-builder staatilise tüübituletusega
- Vitest - https://vitest.dev/ - Vite-native testiraamistik
- ESLint - https://eslint.org/ - JavaScripti ja TypeScripti linter
- Prettier - https://prettier.io/ - koodiformaator
- tsup - https://tsup.egoist.dev/ - TypeScripti bundler

**Veebiraamistikud ja HTTP kliendid**

- Fastify - https://fastify.dev/ - kiire ja väikese overhead’iga Node.js veebiraamistik
- Undici - https://undici.nodejs.org/ - HTTP/1.1 klient Node.js jaoks

**Andmebaasid ja talletus**

- RocksDB - https://rocksdb.org/ - embedditav püsitalletuse key-value store
- SQLite - https://www.sqlite.org/ - iseseisev SQL andmebaasimootor

**Kompressiooniteegid**

- LZ4 - https://lz4.github.io/lz4/ - väga kiire kompressioonialgoritm
- Zstd - https://facebook.github.io/zstd/ - kiire kaotuseta kompressioonialgoritm

**Sõnumside ja IPC**

- ZeroMQ - https://zeromq.org/ - suure jõudlusega asünkroonne sõnumside teek

**Monitooring ja jälgitavus**

- Prometheus - https://prometheus.io/ - monitoorimissüsteem ja ajareade andmebaas
- VictoriaMetrics - https://victoriametrics.com/ - kiire ja kuluefektiivne monitooringulahendus
- Perses - https://perses.dev/ - dashboard-as-code tööriist jälgitavuseks

**Protsessihaldus**

- PM2 - https://pm2.keymetrics.io/ - Node.js rakenduste produktsiooniprotsesside haldur
- Docker - https://www.docker.com/ - konteineriplatvorm

**Krüptovaluutabörsid (andmeallikad)**

- Binance - https://www.binance.com/ - krüptovaluutabörs
- Kraken - https://www.kraken.com/ - krüptovaluutabörs

**Võrdluseks mainitud, kuid mitte kasutusel**

- Apache Kafka - https://kafka.apache.org/ - hajus streaming platvorm
- Apache ZooKeeper - https://zookeeper.apache.org/ - hajus koordineerimisteenus
