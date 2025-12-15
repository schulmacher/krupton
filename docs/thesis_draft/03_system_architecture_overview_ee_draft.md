Süsteemi arhitektuuri ülevaade

Selles peatükis kirjeldatakse reaalajas krüptovaluutade turuandmete töötlemise ja ennustussüsteemi arhitektuurilist ülesehitust. Süsteem on realiseeritud polüglotses monorepos, mis integreerib TypeScripti, Pythoni ja Rusti komponente ning kasutab teenuseorienteeritud arhitektuuri, kus andmete vastuvõtt, teisendamine, talletamine ja ennustus on selgelt eraldatud kihtidesse.

Repositooriumi struktuur

Monorepo järgib domeenipõhist kataloogistruktuuri, kus kood on jaotatud vastutuse ja juurutusmudeli järgi. Repositoorium on jagatud kolmeks põhikataloogiks, millest igaüks täidab eraldi arhitektuurilist rolli.

Kataloog apps/ sisaldab eraldi juurutatavaid teenuseid, mis realiseerivad süsteemi põhifunktsionaalsuse. external-bridge teenus haldab börsiandmete sissevoolu krüptovaluutaplatvormidelt, internal-bridge teenus teostab andmete teisendamist ja voogude haldust ning py-predictor teenus tegeleb masinõppemudelite treenimise ja järeldamisega. Iga rakendus toimib autonoomse teenusena, millel on selgelt piiritletud vastutus ja minimaalne seotus teiste rakendustega.

Kataloog packages/ sisaldab jagatud teeke ja läbilõikelist infrastruktuuri, mida rakendused ja teised paketid tarbivad sõltuvustena pnpm-i tööruumi (workspace) protokolli kaudu. See hõlmab teenuseraamistikke operatiivsete võimekuste pakkumiseks, API klienditeeke, mis abstraheerivad ühendusi börsidega, salvestusabstraktsioone püsivusloogika kapseldamiseks, sõnumivahetuse teeke protsessidevaheliseks suhtluseks ja utiliitfunktsioone üldiste operatsioonide toetamiseks. Paketid on rakendustest sõltumatud, mis tagab nende taaskasutatavuse erinevates teenusekontekstides.

Kataloog runtime/ sisaldab juurutusinfrastruktuuri ja monitooringupinu konfiguratsioone, mis on rakenduskoodist lahti seotud, et võimaldada infrastruktuuri iseseisvat arengut. Sinna kuuluvad VictoriaMetrics’i aegridade andmebaasi konfiguratsioon metrikate talletamiseks ja Perses’i „dashboard-as-code“ definitsioonid jälgitavuse visualiseerimiseks.

Selline struktuur kehtestab selged sõltuvuspiirid: rakendused sõltuvad pakettidest, kuid paketid ise jäävad rakendusagnostilisteks. Selline eraldatus võimaldab selektiivset juurutamist – üksikuid teenuseid saab juurutada ilma kogu monorepot uuesti ehitamata – ning toetab infrastruktuurikomponentide iseseisvat versioonihaldust ilma rakenduskoodi stabiilsust häirimata.

„Zero-knowledge“ seadistamise filosoofia

Repositoorium rakendab „zero-knowledge setup“ filosoofiat, mille eesmärk on vähendada uute arendajate liitumistõkkeid miinimumini. Tööarenduskeskkonna täielikuks käivitamiseks on vaja sooritada ainult kolm järjestikust käsku.

Käsu npm install käivitamine repositooriumi juurkataloogis paigaldab automaatselt pnpm-i ja lahendab tööruumi sõltuvused. See automatiseeritud protsess hõlmab ka runtime-infrastruktuuri seadistamist, laadides alla platvormispetsiifilised binaarid arendaja operatsioonisüsteemi jaoks. Seeläbi kõrvaldatakse vajadus monitooringuinfrastruktuuri käsitsi allalaadimise ja seadistamise järele.

Järgnev käsk pnpm build kompileerib kõik TypeScripti paketid ja Rusti natiivsed sidemed (bindings) kogu monorepos vastavalt sõltuvuste järjekorrale, tagades, et jagatud teegid ehitatakse enne neid tarbivaid rakendusi. Ehitamisprotsess kasutab tööruumi teadlikkust, kompileerides uuesti ainult muudetud paketid ja neist sõltuvad komponendid.

Lõpuks käivitab käsk pnpm --filter '<workspace-name>' start ükskõik millise rakenduse või runtime-teenuse ilma käsitsi konfiguratsiooni, keskkonnamuutujate seadistamise või keelespetsiifiliste tööriistade tundmise vajaduseta. See ühtne liides abstraheerib heterogeensete runtime-keskkondade keerukuse, võimaldades uutel arendajatel käivitada kogu süsteemi või üksikuid komponente juba mõne minuti jooksul pärast repositooriumi kloonimist.

Keeleagnostiline ülesannete orkestreerimine

Kuigi pnpm on JavaScripti paketihaldur, toimib see kogu monorepo ulatuses keeleagnostilise käsurea-tööde käitajana (task runner). See disainivalik lahendab väljakutse hallata heterogeenset koodibaasi, säilitades samas ühtsed arendajate töövood ja CI/CD torujuhtmete definitsioonid.

Iga tööruumi projekt – sõltumata realiseerimiskeelest (TypeScript, Python või Rust) – defineerib oma package.json failis standardiseeritud npm-skriptid. Need skriptid pakuvad ühtset liidest ühtsete sihtnimedega: build, test, lint, format ja typecheck. Skriptide sisu delegeerib tegeliku töö keelespetsiifilistele tööriistadele, mis on iga tööruumi jaoks sobivad.

Näiteks kasutavad Pythonipaketid testimiseks käsku uv run pytest ja lintimiseks uv run ruff check, samal ajal kui Rusti paketid kutsuvad kompileerimiseks cargo build. TypeScripti paketid kompileeritakse tsc abil ja testid jooksevad vitest-i peal. pnpm-i tööruumi filtreerimismehhanism võimaldab ühtset käsuformaati: pnpm --filter '<package-name>' <command> käivitab valitud käsu antud paketis, abstraheerides ära keelespetsiifilised detailid.

See abstraktsioon eemaldab vajaduse, et arendajad peaksid meeles pidama keelespetsiifilisi käsuridade variante või liikuma üksikute pakettide kataloogidesse. Selle asemel rakendub kõikide tööruumide puhul sama käsumuster: pnpm --filter 'service-framework-node' test käivitab TypeScripti testid, samas kui pnpm --filter 'py-service-framework' test käivitab Pythoni testid, kuigi tegelikult kasutatakse täiesti erinevaid testiraamistikke.

Selline lähenemine võimaldab rakendada identseid CI/CD torujuhtmete definitsioone sõltumata realiseerimiskeelest. Üksainus pipeline-konfiguratsioon saab käivitada ühtseid käske läbi heterogeensete tööruumide, käsitledes TypeScripti teenuseid, Pythoni töötajaid ja Rusti natiivmooduleid monorepo ühtsete liikmetena.

Granulaarne arendustöövoog PM2 abil

PM2 protsessihaldur võimaldab peent kontrolli mitmeteenuseliste arenduskeskkondade üle, kasutades hierarhilisi ökosüsteemi konfiguratsioonifaile. See arhitektuuriline muster lahendab väljakutse hallata mitmeid omavahel sõltuvaid teenuseid arenduse ajal, säilitades samal ajal ressursitõhususe ja arendaja produktiivsuse.

Arendajad saavad käivitada valikulisi teenuste kombinatsioone, kombineerides modulaarseid PM2 konfiguratsioonifaile. Näiteks võib arendaja, kes töötab Binance’i tehingute töötlemise kallal, käivitada ainult Binance’i tehingute ja orderite importijad BTCUSDT ja ETHUSDT sümbolite jaoks, selle asemel et kogu teenustevõrku käivitada (sh Kraken ja teised sümbolid). Selline selektiivne käivitamine vähendab ressursikasutust ja kognitiivset koormust, piirdudes ainult käesolevale arendustööle oluliste teenustega.

Iga rakendus (external-bridge, internal-bridge, py-predictor) defineerib teenusepõhised PM2 ökosüsteemi konfiguratsioonid eristades keskkondi (arendus vs. tootmine). Keskkonnataseme kompositsioonifailid võimaldavad orkestreerida suvalisi teenuste alamhulki, toetades iteratiivseid arendustöövooge, kus töötavad ainult asjakohased teenused, samal ajal säilitades võimaluse skaleerida täismahulisele süsteemi integratsioonitestimisele.

PM2 „watch“ režiim võimaldab protsesse automaatselt taaskäivitada failimuudatuste korral, pakkudes kohest tagasisidet arenduse iteratsioonides. Ökosüsteemipõhine lähenemine käsitleb ühtemoodi nii Node.js teenuseid (TypeScript, mis jookseb läbi tsx interpretaatori) kui Pythoni teenuseid, tagades ühtsed protsessihalduse semantikat üle keelepiiride.

Alternatiiv: Docker-konteinerid

Kuigi Docker-konteinerid pakuvad alternatiivset juurutusstrateegiat, mis sobib hästi tootmiskeskkonna isolatsiooni ja reprodutseeritavuse tagamiseks, on otsene protsesside käivitamine lokaalsel masinal aktiivse arenduse jaoks tavaliselt parema arenduskogemusega. Otsene käivitamine võimaldab kiiremaid iteratsioone, vältides konteinerpiltide ümberehitamise lisakulu, pakub loomulikku silumisvõimalust otse protsessidele külge haakudes, annab otsese failisüsteemi ligipääsu, mis võimaldab koodi kuumtaaskäivitust (hot reload), ja vähendab ressursikulu, kuna puudub konteinerikihi overhead. Need tegurid muudavad PM2 natiivse protsessihalduse arenduskeskkondades loomulikumaks ja tõhusamaks valikuks, samal ajal kui Docker jääb eelistatud juurutusmehhanismiks tootmises, kus on olulised isolatsioon ja infrastruktuuri teisaldatavus.

Deterministlik võrguväliselt töötav arendus

RocksDB-põhine salvestuslahendus koos SegmentedLog-abstraktsiooniga võimaldab süsteemil töötada täielikult võrguväliselt, ilma sõltuvuseta välistest teenustest. See võimekus vastab kriitilistele nõuetele arenduskeskkonna stabiilsuse ja masinõppemudelite reprodutseeritavuse osas.

Ajaloolised turuandmed, sealhulgas REST API vastused ja WebSocketi vood, talletatakse järjestikuliste lisamisoperatsioonidega, mis on optimeeritud aegridade andmete jaoks. Salvestusstruktuur on hierarhiline, jagades andmed platvormi, lõpp-punkti ja sümboli järgi, luues deterministliku andmestiku, mida saab korduvate arendusiteratsioonide käigus reprodutseeritavalt uuesti läbi mängida.

Primaarse/sekundaarse instantsi muster lubab kirjutusi primaarinstantsis, samal ajal kui mitmed kirjutuskaitstud sekundaarsed instantsid võimaldavad paralleelset taasesitust, takistamata aktiivset andmete sissevoolu. Selline arhitektuuriline eraldatus tagab, et arendustegevus, mis hõlmab ajalooliste andmete taasesitust, ei sega elavaid andmevooge börsidelt.

Arenduse käigus saab salvestatud ajaloolisi andmeid taasesitada iteratoripõhise tarbimise kaudu, hallates positsiooni offset’ite abil. internal-bridge ja allavoolu ennustustöötlejad tarbivad mitme arendusiteratsiooni vältel identseid sündmuste jadasid, mis tagab konsistentsi andmete teisendusloogika valideerimisel ja tunnuste (feature’ite) inseneri toru (pipeline’i) testimisel.

Olulisus masinõppe arenduses

Selline determinism on kriitilise tähtsusega masinõppemudelite arendamisel, kus ühtlane tunnuste inseneeria ja mudeli hindamine nõuavad turuandmete täpselt korduvat taasesitust. Mudelite jõudlust ei saa usaldusväärselt võrrelda, kui sisendandmed erinevad; erinevate tunnuste või algoritmiliste variantide võrdlemiseks on vaja identseid sisendandmeid, et täheldatud erinevused tuleneksid mudeli muudatustest, mitte andmete varieeruvusest.

Kirjeldatud lähenemine kõrvaldab elavate andmevoogude mitteterminismi, mis tuleneb muu hulgas muutlikest sõnumite saabumisaegadest, võrguriketest ja börside katkestustest. Kontrollitud testimiskeskkond võimaldab valideerida andmete teisendamise loogikat, offset’ite haldust ja tarbijavoogude semantikat, sõltumata välise infrastruktuuri kättesaadavusest või API päringute korduval tegemisel tekkivatest päringupiirangute kuludest.

Teenuseorienteeritud arhitektuur

Süsteem realiseerib teenuseorienteeritud arhitektuuri, kus erinevad töötlemiskihid täidavad spetsiifilisi ülesandeid spetsialiseeritud komponentide kaudu.

Teenuseraamistik

Teenuseraamistik pakub standardiseeritud operatiivset alust, mis tagab ühtsed operatiivvõimekused nii TypeScripti kui Pythoni teenustele. Kahekeelne tugi tagab operatiivse järjepidevuse heterogeensete teenuste vahel.

Service Framework Node

Pakk service-framework-node pakub Node.js/TypeScript-põhist raamistikku, mis realiseerib põhjaliku operatiivse funktsionaalsuse. Raamistik hõlmab diagnostikat struktureeritud logimise kaudu, kasutades korrelatsiooni-ID-sid päringute jälgimiseks teenusepiirideüleste voogude lõikes; metrikate avaldamist Prometheuse formaadis VictoriaMetrics’i tarbeks; tüübikindlat keskkonnakonfiguratsiooni valideerimist TypeBox’i skeemide abil; protsessi elutsükli haldust, sh signaalide töötlemine ja graatsiline seiskamine; ning HTTP/WebSocket-serverite haldust Fastify baasil.

Raamistik kasutab modulaarset kontekstiloome mustrit, mis eraldab alam-süsteemide initsialiseerimise serveri elutsükli haldusest. See eraldatus võimaldab sõltuvuste süstimist testideks ning raamistikuvõimekuste paindlikku kombineerimist vastavalt teenuse vajadustele.

Pythoni teenuseraamistik

Pakk py-service-framework pakub samaväärset raamistikufunktsionaalsust Pythoni teenustele, kasutades konfiguratsiooni valideerimiseks Pydantic’ut. Pythoni raamistik realiseerib samad operatiivsed mustrid, sh protsessi elutsükli haldus, struktureeritud logimine, Prometheuse metrikate avaldamine ja HTTP-serveri tugi, tagades operatiivse järjepidevuse üle keelepiiri. See ühtsus võimaldab heterogeenses teenusmaastikus ühtset monitooringut, logimist ja elutsükli haldust.

API kliendi arhitektuur

API kliendi arhitektuur realiseerib börsiühenduste jaoks kihi, mis põhineb skeemipõhisel valideerimisel. Arhitektuuri moodustavad kolm spetsialiseeritud paketti, mis käsitlevad erinevaid börsisuhtluse aspekte.

HTTP REST klient

Pakk api-client-node realiseerib HTTP REST kliendi, kasutades suure jõudlusega Undici teeki päringute tegemiseks. Klient toetab path-parameetrite interpolatsiooni dünaamiliste URL-ide koostamiseks, päringuparameetrite stringi konstruktsiooni automaatse kodeerimisega, päringu- ja vastuskehade valideerimist TypeBox’i skeemidega, struktureeritud veahaldust, mis eristab võrgutõrkeid, HTTP olekukoodiga seotud vigu ja valideerimisvigu, ning autentimispealkirjade (authentication headers) lisamist autentitud lõpp-punktidele.

Kliendiarhitektuur abstraheerib börsispetsiifilised HTTP-suhtluse detailid, pakkudes samal ajal tüübikindlaid liideseid TypeScripti integratsiooni abil ja runtime’i tasemel valideerimist skeemipõhise kontrolliga.

WebSocket klient

Pakk api-client-ws-node realiseerib WebSocket-ühenduse loomise koos sõnumite runtime-valideerimise ja tüübikindla voogude käsitlemisega. Realisatsioon kasutab kompileeritud TypeBox’i valideerijaid sõnumiskeemide kontrollimiseks, tuvastades varakult protokollirikkumised või vigased sõnumid.

Voogude-spetsiifiline sõnumite identifitseerimine toimub diskrimineerimisfunktsioonide kaudu, mis võimaldavad ühe WebSocket-ühenduse kaudu multipleksida mitut voogu. Klient realiseerib struktureeritud veahaldust nii ühenduse vigade kui valideerimisvigade korral, pakkudes detailset infot, sh millised skeemi reeglid said rikkutud. Tüübikindel handler’ite väljakutse voogude definitsioonide alusel tagab, et sõnumikäitlejad saavad õigesti tüübistatud objektid.

Ühtsed skeemide definitsioonid

Pakk api-interface pakub ühtseid skeemide definitsioone Binance’i ja Krakeni API-de jaoks nii HTTP REST lõpp-punktide kui WebSocket-voogude tasemel. Skeemid on defineeritud TypeBox’i abil, mis võimaldab TypeScripti tarbijatel kompileerimisajal automaatset tüübijäreldust ning runtime’is valideerimisskeemide kasutamist päringuparameetrite (sh path-parameetrid, päringuparameetrid ja päringukehad) ja vastusstruktuuride kontrolliks.

See kaheotstarbeline skeemide definitsioon elimineerib vajaduse käsitsi tüübi deklaratsioonide ja valideerimiskoodi järele. TypeScripti tarbijad saavad kasu automaatsest tüübijäreldusest, samal ajal kui runtime’i valideerimine tagab, et tegelikud API vastused on kooskõlas deklareeritud skeemidega, tuvastades varakult API lepingute rikkumised või ootamatud vastuseformaadid.

Salvestusinfrastruktuur

Salvestusinfrastruktuur realiseerib keeleülese püsisalvestuse RocksDB LSM-puu arhitektuuriga, pakkudes suure jõudlusega järjestikulisi kirjutusi ja indekseeritud lugemist, mis on optimeeritud aegridade töökoormuste jaoks.

Rust RocksDB sidemed

Pakk rust-rocksdb-napi pakub keeleüleseid RocksDB sidemeid, mis on kirjutatud Rustis. Pakk kasutab NAPI-RS raamistikku Node.js integratsiooniks N-API kaudu ja Maturin’i Pythoni integratsiooniks PyO3 abil, võimaldades jagatud salvestusinfrastruktuuri nii TypeScripti kui Pythoni teenustele.

Selle kohandatud sideme realisatsioon oli vajalik, kuna olemasolevad keelespetsiifilised RocksDB teegid (node-rocksdb, python-rocksdb) on kas hooldamata või ei toeta vajalikke funktsioone nagu sekundaarinstantsid. Realisatsioon pakub SegmentedLog-abstraktsiooni järjestikuste lisamisoperatsioonidega, mis on optimeeritud aegridade andmete jaoks, toetab tihendust LZ4 ja Zstd algoritmidega, realiseerib primaar-/sekundaarinstantsi mustri paralleelsete lugemiste ja kirjutuste jaoks, pakub iteratoripõhist paketilist lugemist (batch read) konfigureeritava partii suurusega ulatuslike andmehulga tarbimiseks ning truncation-operatsioone logide puhastamiseks ja ajalooliste andmete eemaldamiseks.

Kõrgema taseme salvestuskiht

Pakk persistent-storage-node realiseerib kõrgema taseme TypeScripti salvestuskihi, mis pakub entiteedipõhiseid abstraktsioone REST API vastuste ja WebSocketi sõnumite salvestamiseks. Pakk realiseerib iga toetatud andmeallika jaoks (sh Binance ja Kraken ajaloolised tehingud, orderiraamatud, sügavusvood ja ticker’ite vood) per-lõpp-punkt salvestusentiteedid.

Salvestusentiteedid hallavad automaatselt alamindekseid, jaotades andmed sümboli ja ajatemplite järgi, mis võimaldab efektiivset pärimist ja selektiivset andmetele ligipääsu. Andmetransformaatorid teisendavad platvormispetsiifilised formaadid ühtseteks skeemideks, luues ühtlustatud tehingud (normalized trades) ja ühtlustatud orderiraamatud (standardiseeritud ostu-/müügipoole struktuuridega), mis lihtsustab platvormiagnostilist allavoolu töötlemist.

Mitme entiteedi lugejad (multi-entity readers) võimaldavad andmete tarbimist mitmest allikast koos offset’i jälgimise ja iteratoripõhise voogedastusega, toetades heterogeensete andmeallikate efektiivset töötlemist ühtse tarbimisliidese kaudu.

Protsessidevaheline kommunikatsioon

Protsessidevaheline kommunikatsioon realiseerib ZeroMQ-põhise sõnumivahetuse suure jõudlusega IPC jaoks Node.js teenuste vahel. ZeroMQ pakub madalamat latentsust ja kõrgemat läbilaskevõimet kui traditsioonilised TCP-põhised sõnumivahendajad, mis teeb sellest sobiva lahenduse kõrgsagedusliku turuandmete jaotamiseks.

Sõnumivahetuse implementatsioon

Pakk messaging-node realiseerib ZeroMQ pub/sub mustrid läbi publisher’i ja subscriber’i abstraktsioonide, kasutades registrimustrit mitme voo lõpp-punktide haldamiseks. Publisher’id realiseerivad saatmisjärjekorra koos puhvriga, kui sokkel on hõivatud, asünkroonse saatmise partii toega (kuni 100 sõnumit partii kohta) ning salvestusrekordite JSON-serialiseerimise võrgus edastamiseks.

Subscriber’id pakuvad asünkroonse iteratori abil sõnumite tarbimist, mis sobitub hästi kaasaegsete asünkroonsete JavaScripti mustritega, teostavad saabunud JSON-payload’ide automaatse deserialiseerimise ja haldavad ühendusi soklimallide abil, mis genereerivad IPC-sokli teid platvormi- ja sümboliidentifikaatorite alusel, võimaldades selektiivset tellimist konkreetsetele andmevoogudele.

Registrimuster võimaldab selektiivset tellimist konkreetsetele andmevoogudele, eristades platvormi, instrumenti või andmetüüpi, ilma et oleks vaja täielikku võrgusilmust (full mesh connectivity). Näiteks saab subscriber ühendada ainult Binance BTCUSDT tehinguvooga, ilma et ta peaks looma ühendusi Krakeni või teiste sümbolite voogudega, vähendades ressursikulu ja võrgu overhead’i.

Jagatud infrastruktuur

Jagatud infrastruktuur koosneb ühistest utiliididest ja konfiguratsioonihaldusest, mis toetab kõiki rakendusi ja pakette.

Utiliidid

Pakk utils pakub taaskasutatavaid utiliitfunktsioone kogu koodibaasis. See hõlmab eksponentsiaalse tagasilöögi (exponential backoff) retry-loogikat funktsiooni tryHard kaudu, millel on konfigureeritavad algviivitus, maksimaalne viivitus ja backoff’i kordaja; asünkroonsed sünkroniseerimisprimitiivid, sh lubaduselukud (promise locks) ja event loop’i vabastamiseks mõeldud yield’imise utiliidid; kogumite abifunktsioonid, sh massiivide teisendamine multimap’iks grupeerimisoperatsioonide jaoks; ning tüübikaitsjad (type guards), sh null-/undefined-kontrollid ja turvaline JSON-serialiseerimine, mis käsitleb serialiseerimisvigu graatsiliselt.

Konfiguratsioonihaldus

Pakk config pakub tsentraliseeritud konfiguratsioonifaile monorepo-ülese tööriistade konsistentsuse tagamiseks. See hõlmab ESLint’i reegleid ühtse koodikvaliteedi säilitamiseks, Prettier’i vormindusreegleid ühtse stiili tagamiseks, TypeScripti baas-konfiguratsiooni ühiste kompilaatori valikutega, Vitest’i testikonfiguratsiooni testide jooksutamise parameetrite määratlemiseks ning tsup’i bundleri seadeid ühtlustatud build-protsesside jaoks.

Need tsentraliseeritud konfiguratsioonid tagavad ühtse koodistiili, lintimisreeglid ja build-protsessid kõigi TypeScripti ja JavaScripti pakettide jaoks, sõltumata nende runtime-keskkonnast, vähendades konfiguratsiooni hoolduskulu ja tagades konsistentsuse uute pakettide lisamisel.

Arhitektuurimustrid

Süsteemi arhitektuur kasutab mitmeid korduvaid mustreid, mis lahendavad ühiseid väljakutseid eri komponentides.

Skeemipõhine tüübikindlus

Lõpp-punktide definitsioonid deklareerivad selgesõnaliselt HTTP teed, meetodid, päringuparameetrid, päringukehad ja vastuse skeemid, kasutades TypeBox’i. Skeemipõhine lähenemine pakub nii kompileerimisajalist tüübikindlust TypeScripti tüübijärelduse kaudu kui ka runtime’i valideerimist kompileeritud valideerijate abil.

Runtime’i valideerimine toimub TypeBox’i kompileeritud valideerijate kaudu, tagades, et päringud ja vastused vastavad deklareeritud skeemidele ilma käsitsi tüübiassertsioonideta. Kui API vastus saabub, kontrollib valideerija, et vastuse struktuur vastab skeemile, tuvastades puuduvad väljad, valed tüübid või ootamatud lisaväljad. TypeScripti tüübijäreldus pakub kompileerimisajalist turvalisust, tuletades skeemidest staatilised tüübid, mis võimaldavad IDE-s automaatset täitmist, kompileerimisvigade varajast avastamist ja turvalist refaktoreerimist ilma koodigeneratsioonita.

See kaheotstarbeline lähenemine elimineerib vajaduse eraldi tüübide definitsioonifailide ja valideerimisimpelementatsioonide järele, vähendades hoolduskulu ja tagades, et kompileerimisajalised tüübid ja runtime’i valideerimisloogika on kooskõlas.

Entiteedipõhine salvestusabstraktsioon

Salvestusentiteedid kapseldavad platvormispetsiifilise API vastuste püsivust erinevate kombinatsioonide jaoks: platvorm (Binance vs Kraken) ja andmeallika tüüp (REST vs WebSocket). Iga entiteet rakendab normaliseeritud alamindeksite nimetamise konventsioone, mis tagavad ühtse salvestusstruktuuri, automaatse ajatemplite ekstraheerimise platvormispetsiifilistest sõnumitest ja partiioperatsioonid, mis optimeerivad kirjutusläbilaske kõrgsagedusliku sissevoolu korral.

See abstraktsioon võimaldab ühtseid salvestusmustrid sõltumata andmeallika omadustest. Tarbijad suhtlevad salvestusega läbi ühtse liidese, mille taga on peidetud platvormispetsiifilised formaadid ja salvestusorganisatsiooni detailid.

Registrimuster IPC jaoks

Publisher’i ja subscriber’i registrid haldavad ZeroMQ soklite kogumeid, kasutades mallipõhist lõpp-punktide genereerimist. Registrimuster võimaldab voogude dünaamilist valikut runtime’is, nii et teenused saavad tellida ainult vajalikke andmevooge ilma ühendusetopoloogiat muutmata või teenuseid taaskäivitamata.

Näiteks võib ennustustöötleja tellida ainult Binance BTCUSDT tehinguvoo, ühendudes vastava sokliga, mille genereerib mallifunktsioon. ETHUSDT toe lisamine eeldab ainult sama mallifunktsiooni väljakutset uue sümboli identifikaatoriga, ilma et peaks muutma töötlusloogikat või uuendama konfiguratsioonifaile.

Platvormi laiendatavus

Uute krüptobörside lisamine nõuab minimaalselt integratsioonitööd tänu arhitektuuri lahtisidumisele ja üldistatud abstraktsioonidele. Platvormiintegratsioon järgib kindlat neljaastmelist mustrit.

Esiteks defineerib arendaja platvormispetsiifilised REST-lõpp-punktide ja WebSocket-sõnumite TypeBox’i skeemid isoleeritud api-interface alamkataloogides, järgides nimekonventsiooni newPlatform/newPlatformHttp/ ja newPlatform/newPlatformWS/. Need skeemid deklareerivad uue börsi päringuparameetrid ja vastusstruktuurid.

Teiseks loob arendaja platvormispetsiifilised konteksti- ja protsessifailid external-bridge kataloogi, kasutades olemasolevaid malle, näiteks newPlatformWebsocketContext.ts ja newPlatformWebsocketProcess.ts. Need failid realiseerivad teenuse initsialiseerimise ja andmete sissevoolu loogika vastavalt platvormi ühendusnõuetele.

Kolmandaks lisab arendaja soklimalli funktsioonid paketti messaging-node, järgides ühtseid nimekonventsioone nagu newPlatformTradeWs ja newPlatformOrderBook. Need mallid võimaldavad teistel teenustel tellida uue platvormi andmevooge, kasutades olemasolevat registrimustrit.

Neljandaks realiseerib arendaja salvestusentiteedid pakis persistent-storage-node, luues õhukesed wrapper-funktsioonid, mis kutsuvad generilisi salvestustehaseid platvormispetsiifiliste voogude definitsioonidega, näiteks createWebSocketStorage<typeof NewPlatformWS.TradeStream>. See lähenemine kasutab TypeScripti generikuid tüübikindlate salvestusliideste (WebSocketStorage<T>, WebSocketStorageRecord<T>) automaatseks tuletamiseks ilma käsitsi tüübide defineerimiseta.

Platvormi implementeeringud on omavahel lahti seotud ega sõltu teineteisest; need kasutavad ainult jagatud infrastruktuuri, sh teenuseraamistikku, salvestuskihti ja sõnumivahetuse abstraktsioone. Selline isolatsioon võimaldab mitme börsi integratsioonide paralleelset arendust ilma vajaduseta kooskõlastada tööd või karta regressioone olemasolevates Binance’i või Krakeni integratsioonides. Uue börsi lisamisel ei pea arendaja muutma ega testima olemasolevaid integratsioone.

Operatiivne lihtsus ja salvestuse evolutsioon

Lõplik RocksDB-põhine salvestusarhitektuur elimineerib hajusate sõnumibrokerite klastri (nt Kafka ja ZooKeeper) halduskulu, säilitades samas vootöötlussüsteemidele iseloomulikud semantikad SegmentedLog-abstraktsiooni kaudu: järjestuslik tellimus, offset-põhine tarbimine ja primaar-/sekundaarinstantsi muster paralleelseteks lugemisteks.

Salvestusbackend’i evolutsioon

Kirjeldatud lahendus kujunes välja iteratiivse katsetamise käigus erinevate salvestusbackend’idega, millest igaüks lahendas eelnevate lähenemiste kitsaskohti, ent tõi kaasa uusi väljakutseid.

Esialgne JSONL (newline-delimited JSON) lahendus pakkus inimloetavat salvestusformaati ja lihtsat append-only semantikat. Siiski oli selle lähenemise puuduseks liigne kettaruumikulu tihenduse puudumise tõttu ning vajadus käsitsi bait-positsioonide indekseerimise järele efektiivse juhusliku ligipääsu võimaldamiseks. Ilma bait-offse professionaalse indekseerimiseta pidi iga lugemine alustama faili algusest, et leida soovitud kirje, mis tähendas O(n) keerukust offset-põhise ligipääsu jaoks.

Järgmine SQLite-põhine implementeering vähendas kettakasutust tänu SQLite sisemistele optimeerimistele, kuid isegi sel juhul kasvas andmebaas kõrgsagedusliku sissevoolu tõttu üle 10 GB päevas, isegi kui jälgiti vaid 5 sümbolit platvormi kohta. Veelgi olulisemaks probleemiks osutusid truncation-operatsioonid miljonite kirjetega tabelitel: nende täitmine võttis kümneid minuteid, mille jooksul kirjutamised olid blokeeritud SQLite’i globaalse kirjutuslukustuse tõttu. See muutis ajalooliste andmete puhastamise operatsioonid elava andmevoo jaoks häirivaks.

RocksDB LSM-puu arhitektuur lahendab need kitsaskohad mitme omaduse kaudu. Sisseehitatud tihendus LZ4 või Zstd algoritmidega vähendab salvestusmahtu, kasutades ära JSON-serialiseeritud turuandmete korduvust. Efektiivne vahemike kustutamine kompaktimise kaudu võimaldab ajalooliste andmete truncation’i teostada sekundite jooksul, märgistades võtmevahemikud kustutatuks ja tehes tegeliku puhastuse taustkompaktimisel, ilma kirjutusi blokeerimata. Kirjutusoptimeeritud järjestikulised lisamisoperatsioonid toetavad kõrge läbilaskega sissevoolu, võimaldades samal ajal lugemisi primaar-/sekundaarinstantsi mustri kaudu: kirjutused toimuvad primaaril, samal ajal kui kirjutuskaitstud sekundaarsed instantsid teenindavad lugemispäringuid iseseisvalt.

Jõudlusomadused

Hilisem jõudlusanalüüs (vt 13. peatükk) demonstreerib RocksDB eeliseid kirjeldatud töökoormuse puhul, kinnitades arhitektuurilise otsuse vahetada alternatiivsed salvestusbackendid RocksDB vastu.

Jälgitavuse infrastruktuur

Jälgitavuse infrastruktuur rakendab „dashboard-as-code“ lähenemist, kasutades Perses’t ja VictoriaMetrics’it protsesside mälukasutuse, kohandatud rakendusmõõdikute ja süsteemse telemeetria jälgimiseks. See näitab, et deklaratiivne jälgitavuse konfiguratsioon on rakendatav nii arendus- kui tootmiskeskkonnas.

Dashboard’ide definitsioonid on versioonihalduses koos rakenduskoodiga, mis võimaldab dashboard’ide reprodutseeritavat juurutamist ja tagab, et jälgitavuskonefiguratsioon areneb sünkroonis süsteemi arhitektuuriliste muutustega. See on vastand käsitsi dashboard’ide ehitamisele veebiliideste kaudu, mis kipub viima konfiguratsioonide triivini ja dashboard’ide kadumiseni infrastruktuuri ümber ehitamisel.

Andmevoog ja süsteemi integratsioon

Terves süsteemis kulgeb andmevoog välistelt krüptobörsidelt läbi mitme töötlemisetapi kuni lõplike ennustusteni. Börsiandmed sisenevad läbi external-bridge teenuse, läbivad normaliseerimise ja voogude halduse internal-bridge teenuses, talletatakse RocksDB-s, jaotatakse ZeroMQ sõnumivahetuse kaudu ja jõuavad masinõppemudelite treenimise ja järeldamiseni teenuses py-predictor.

Arhitektuur kehtestab selge vastutuse eraldatuse eri töötlemisetappide vahel. Teenuseraamistik käsitleb operatiivseid läbilõikeprobleeme – jälgitavus, konfiguratsioonihaldus, protsessi elutsükli haldus – ühtselt nii Node.js kui Pythoni teenustes. API kliendikiht abstraheerib börsiühendused skeemipõhise valideerimise ja tüübikindlate liideste kaudu, eraldades allavoolu komponendid börsispetsiifilistest protokollidest. Salvestusinfrastruktuur pakub keeleülest RocksDB-põhist püsisalvestust entiteedipõhise abstraktsiooni ja andmetransformatsiooni torudega, võimaldades efektiivseid andmepäringu mustreid. Sõnumivahetuskiht võimaldab kõrge jõudlusega IPC-d ZeroMQ pub/sub mustriga koos selektiivse voogude tellimisega, minimeerides võrgukulu. Jagatud infrastruktuur – utiliidid ja konfiguratsioonid – tagab konsistentsuse polüglotse koodibaasi ulatuses.

Kihtidel põhinev arhitektuur realiseerib Kafka-sarnase vootöötluse semantika – järjestatud tarbimine, offset’ite jälgimine, taasesitusvõime – RocksDB peal, ilma hajusate broker-klastrite keerukuseta. Nii saavutatakse vootöötlussüsteemidele omased omadused, säilitades samas operatiivse lihtsuse, mis sobib nii ühe masina juurutustele kui arenduskeskkondadele.

Tehnoloogiad ja tööriistad

Selles alapeatükis tuuakse välja kõik süsteemi realiseerimisel kasutatud tehnoloogiad, raamistikud, teegid ja tööriistad.

Paketihaldus ja build-tööriistad

pnpm – https://pnpm.io/
– kiire ja kettaruumisäästlik paketihaldur

npm – https://www.npmjs.com/
– Node.js paketihaldur

Programmeerimiskeeled ja runtime’id

TypeScript – https://www.typescriptlang.org/
– JavaScripti tüübikindel superset

Node.js – https://nodejs.org/
– JavaScripti runtime

Python – https://www.python.org/
– kõrgtaseme programmeerimiskeel

Rust – https://www.rust-lang.org/
– süsteemiprogrammeerimise keel

Pythoni tööriistad

uv – https://github.com/astral-sh/uv
– kiire Pythoni paketipaigaldaja ja -lahendaja

Ruff – https://github.com/astral-sh/ruff
– kiire Pythoni linter ja formatter

Pydantic – https://docs.pydantic.dev/
– andmete valideerimise teek Pythoni tüübimäärangute põhjal

Rust build-tööriistad

Cargo – https://doc.rust-lang.org/cargo/
– Rusti paketihaldur ja build-tööriist

NAPI-RS – https://napi.rs/
– raamistik Node.js lisamoodulite (addons) kirjutamiseks Rustis

Maturin – https://github.com/PyO3/maturin
– Rustipõhiste Pythoni pakettide build ja avaldamine

PyO3 – https://pyo3.rs/
– Rusti sidemed Pythoniga

TypeScript/JavaScript tööriistad

tsx – https://github.com/privatenumber/tsx
– TypeScripti otsekäivitaja (run TS files directly)

TypeBox – https://github.com/sinclairzx81/typebox
– JSON Schema tüübiloome teek statilise tüübijäreldusega

Vitest – https://vitest.dev/
– Vite-native testiraamistik

ESLint – https://eslint.org/
– JavaScripti ja TypeScripti linter

Prettier – https://prettier.io/
– koodiformaator

tsup – https://tsup.egoist.dev/
– TypeScripti bundler

Veebiraamistikud ja HTTP kliendid

Fastify – https://fastify.dev/
– kiire ja väikese overhead’iga Node.js veebiraamistik

Undici – https://undici.nodejs.org/
– HTTP/1.1 klient Node.js jaoks

Andmebaasid ja salvestus

RocksDB – https://rocksdb.org/
– embeddable püsiv key-value salvestiteek

SQLite – https://www.sqlite.org/
– iseseisev SQL-andmebaasi mootor

Tihendusteegid

LZ4 – https://lz4.github.io/lz4/
– väga kiire tihendusalgoritm

Zstd – https://facebook.github.io/zstd/
– kiire kaotuseta tihendusalgoritm

Sõnumivahetus ja IPC

ZeroMQ – https://zeromq.org/
– suure jõudlusega asünkroonne sõnumivahetuse teek

Monitooring ja jälgitavus

Prometheus – https://prometheus.io/
– monitooringusüsteem ja aegridade andmebaas

VictoriaMetrics – https://victoriametrics.com/
– kiire ja kulutõhus monitooringulahendus

Perses – https://perses.dev/
– dashboards-as-code jälgitavuse jaoks

Protsessihaldus

PM2 – https://pm2.keymetrics.io/
– Node.js rakenduste tootmistaseme protsessihaldur

Docker – https://www.docker.com/
– konteineriplatvorm

Krüptovaluutabörsid (andmeallikad)

Binance – https://www.binance.com/
– krüptovaluutabörs

Kraken – https://www.kraken.com/
– krüptovaluutabörs

Võrdluseks mainitud, kuid mitte kasutusel olevad tehnoloogiad

Apache Kafka – https://kafka.apache.org/
– hajus vootöötlusplatvorm

Apache ZooKeeper – https://zookeeper.apache.org/
– hajus koordineerimisteenus
