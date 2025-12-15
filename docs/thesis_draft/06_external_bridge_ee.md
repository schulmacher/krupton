# External Bridge: andmekogumise kiht

External Bridge (välissild) on süsteemi peamine liides väliste krüptobörsidega. Selle ülesanne on koguda reaalajas turuandmeid mitme protokolli kaudu ning tagada andmete püsiv salvestamine kõrge töökindlusega. Komponent realiseerib mitmeprotsessilise arhitektuuri, mis on optimeeritud suure läbilaskevõime (throughput) ja tõrkeisolatsiooni (fault isolation) jaoks, säilitades samal ajal deterministliku andmekogumise, mis on sobiv hilisemate masinõppe töövoogude tarbeks.

## Arhitektuuri ülevaade

External Bridge kasutab protsessipõhist eraldusstrateegiat, jagades andmekogumise vastutused kolmeks selgelt eristuvaks protsessitüübiks: REST API pärijad (fetchers), WebSocket voogude tarbijad ja salvestuse haldusteenused. Iga protsessitüüp töötab sõltumatult ja eraldatud ressursijaotusega, mis võimaldab koormuse järgi selektiivset skaleerimist. See loob tõrkeisolatsiooni piirid, mis välistavad ahelreaktsiooni tõrked andmete sissevõtu torustikus.

### Protsesside eraldusmudel

**REST API pärija protsessid** töötavad tõmbepõhisel mudelil: nad pärivad perioodiliselt börsi lõpp-punkte, et saada ajaloolisi tehinguandmeid, tehinguraamatu hetktõmmiseid ja börsi metaandmeid. Iga sümbol-platvorm kombinatsioon võib olla seotud omaette pärija protsessiga, mis võimaldab peenhäälestada API kiiruspiiranguid ning koguda paralleelselt andmeid mitmest kauplemispaarist ilma ressursikonfliktideta.

**WebSocket voogude protsessid** hoiavad püsivaid ühendusi börside WebSocket lõpp-punktidega ning tarbivad reaalajas tehingute täitmisi ja tehinguraamatu diferentsiaaluuendusi nende tekkimise hetkel. Kuna WebSocket on tõukepõhine kanal, eeldab see pidevat töötlust. Protsessiisoleerimine on kriitiline, et vältida sõnumijärjekorra ülevoolu olukorras, kus allavoolu tarbijad ajutiselt aeglustuvad.

**Salvestuse haldusprotsessid** tegelevad ortogonaalsete (st andmekogumisest eraldiseisvate) ülesannetega: perioodiline statistika kogumine, varunduse orkestreerimine ning ajaloolise andmestiku säilituspoliitikad (retention policies). Hooldusoperatsioonide eraldamine aktiivsest andmete sissevõtust tagab, et varunduse pakkimine või pilvesünkroniseerimine ei mõjuta reaalaja andmekogumise latentsust ega läbilaskevõimet.

Selline dekompositsioon võimaldab sõltumatut juurutamist ja taaskäivitamist iga protsessitüübi jaoks. REST pärijaid saab taaskäivitada kiiruspiirangute parameetrite muutmiseks ilma WebSocket voogusid katkestamata. WebSocket protsessid rakendavad platvormispetsiifilist taasühendumisloogikat (nt Binance'i 24-tunnine ühenduse piirang) ilma ajalooliste andmete tagantjärele täitmise protsesse mõjutamata. Salvestusprotsessid võivad teostada ressursimahukaid pakkimisi ja pilveüleslaadimisi omaette ajakava alusel, blokeerimata andmete sissevõtu kriitilisi teid.

## Service Context muster

External Bridge rakendab sõltuvuste süstimist (dependency injection) struktureeritud kontekstimustri (context pattern) abil: iga protsess saab „kontekstiobjekti”, mis kapseldab kõik välised sõltuvused ja konfiguratsiooni. See tagab läbinähtavuse protsesside sõltuvustele, hõlbustab protsesside sõltuvuste haldamisele ning parandab testitavust, sest ühiktestides (unit tests) saab tootmissõltuvused asendada mock-implementatsioonidega.

Kontekstiobjekt koondab mitu alamsüsteemi:

**Salvestuskäepidemed** annavad tüübiohutut ligipääsu RocksDB-põhistele püsikihtidele, eraldi käepidemetega iga andmeolemi kohta (ajaloolised tehingud, tehinguraamatu hetktõmmised, diferentsiaalsed sügavusuuendused, WebSocket tehinguvoog). Iga käepide on seadistatud sobivate kirjutamisõiguste ja pakkimisparameetritega, hoides salvestuskonfiguratsiooni äriloogikast eraldi.

**ZeroMQ Publisher’id** edastavad sissevõetud andmeid allavoolu tarbijatele protsessidevahelise suhtluse (IPC) kanalite kaudu. Publisher’i instantsid on koondatud registritesse (registry), mis võimaldab tellida (subscribe) vaid kindlaid voogusid platvormi ja sümboli identifikaatorite järgi. Registrimuster toetab dünaamilist voogude tekitamist ilma teenuse taaskäivitamiseta.

**Kiiruspiirajad (Rate Limiters)** kapseldavad platvormispetsiifilist päringute „drosseerimist” (throttling), rakendades libiseva akna (sliding window) algoritme seadistatavate kvootide ja ajavahemikega. Kiiruspiiraja olek (päringute loendur, aknapiirid) püsib kontekstis kapseldatuna, vältides jagatud muudetavat olekut (shared mutable state) paralleelsete operatsioonide vahel.

**Tüübistatud API kliendid (Typed API Clients)** pakuvad skeemivalideeritud (schema-validated) liideseid REST- ja WebSocket-lõpppunktidele, kasutades kompileerimisajal (compile-time) tüübikindlust TypeBox’i skeemimääratluste kaudu. Kliendi konfiguratsioon (baas-URL, autentimisheader’id, korduskatsete poliitikad) initsialiseeritakse konteksti loomisel ning on protsessi täitmise ajal muutumatu (immutable).

Konteksti loomine järgib funktsionaalse kompositsiooni põhimõtet: keskkonnakonfiguratsiooni valideerimine annab valideeritud konfiguratsiooniobjekti; diagnostika (logimine, meetrikad) initsialiseeritakse konfiguratsioonist; salvestus- ja sõnumiedastuse alamsüsteemid luuakse koos diagnostikakontekstiga (struktureeritud logimiseks); lõpuks konstrueeritakse API kliendid koos autentimisandmete ja diagnostikakonksudega (hooks). Selline järjekord teeb sõltuvuste järjestuse eksplitsiitseks ning välistab arhitektuuriliselt tsüklilised sõltuvused (circular dependencies).

## REST API pärija teostus

REST API pärijad realiseerivad üldise pärimistsükli abstraktsiooni, mis kutsub perioodiliselt börsi lõpp-punkte, salvestab vastused lokaalsesse püsikihti ja edastab uued andmed ZeroMQ publisher'ite kaudu. Teostus eelistab töökindlust: põhjalik veakäsitlus, adaptiivne kiiruspiiramine ning deterministlik käitumine, mis sobib võrguühenduseta taasesituse stsenaariumideks.

### Pärimistsükli abstraktsioon

Põhitsükkel hoiab sisemist olekut: päringute arv, viimase päringu ajatempel ja kumulatiivne vealoendur. See võimaldab tervisemonitooringut meetrikate kaudu ning annab diagnostilist konteksti kiiruspiirangute või lõpp-punkti rikete analüüsimiseks.

Iga iteratsioon täidab mitmefaasilise töövoo:

1. **Parameetrite konstrueerimine**: kasutaja antud funktsioon genereerib päringu parameetrid varasemate vastuste ja salvestatud oleku põhjal. Ajalooliste tehingute korral tähendab see järgmise `fromId` leidmist viimase salvestatud tehingu identifikaatori põhjal. Perioodiliste snapshot’ide (börsi info, orderiraamatu sügavus) puhul jäävad parameetrid tavaliselt konstantseks.

2. **Kiiruspiiramine**: enne HTTP-päringu tegemist küsitakse kiiruspiirajalt, kas kvoot lubab uue päringu. Kui kvoot on täis, peatub pärija kuni libisev aken nihkub piisavalt, et uus päring oleks lubatud.

3. **Päringu teostus**: tüübistatud API klient sooritab HTTP-päringu ja valideerib vastuse skeemi vastu. Riketel rakendatakse eksponentsiaalset tagasilööki (exponential backoff) koos seadistatava katsete arvu ja viite kordajaga.

4. **Vastuse püsisalvestus**: edukad vastused salvestatakse RocksDB-sse olemi-spetsiifiliste salvestuskäepidemete kaudu; need omistavad järjestikulised identifikaatorid ja eraldavad ajatemplid indekseerimiseks.

5. **Sõnumite levitamine**: salvestatud kirjed serialiseeritakse JSON-iks ja avaldatakse ZeroMQ publisher’ite kaudu, võimaldades allavoolu tarbijatel töödelda uusi andmeid minimaalse latentsusega.

6. **Intervalli haldus**: tsükkel arvutab järelejäänud aja järgmise planeeritud päringuni, arvestades päringu ja salvestuse aega. Kui täitmine ületab seadistatud intervalli, alustatakse järgmist iteratsiooni kohe, vältides kunstlikke viiteid, mis muidu „kuhjuksid” ja suurendaksid latentsust.

### Kiiruspiiramise strateegia

Kiiruspiiraja kasutab libiseva akna algoritmi: jälgitakse päringute ajatemplite loendit kindlas ajavahemikus. Uue päringu katsel loetakse aknas olevad päringud kokku ja võrreldakse maksimaalse lubatud kvoodiga. Kui kvoot on täis, arvutatakse minimaalne viide, mille järel vanim päring langeb aknast välja, ning tagastatakse see viide kutsujale.

Teostus jaotab päringud ühtlaselt kogu ajavahemiku peale, mitte ei luba päringupurskeid. Arvutades `defaultWaitMs = windowMs / maxRequests`, saavutatakse stabiilne päringutempo, mis maksimeerib läbilaskevõime ja säilitab deterministliku ajastuse. See vähendab olukordi, kus mitmed pärijad pärast sünkroonset taaskäivitust samaaegselt limiidid täis jooksevad.

**Eksponentsiaalne tagasilöök vigade korral**: kui päringud ebaõnnestuvad kiiruspiirangu (HTTP 429), võrguvigade või valideerimisvigade tõttu, lülitub kiiruspiiraja backoff-olekusse, rakendades järjestikustele päringutele korrutavaid viiteid. Viite kestus kahekordistub iga järjestikuse vea järel, kuni seadistatava maksimumini (vaikimisi 60 s). Edukas päring lähtestab backoff-oleku, võimaldades kiiret taastumist ajutistest riketest ning kaitstes samal ajal olukordade eest, kus püsivad vead viitavad börsi katkestusele või API muutustele.

See kahe režiimi käitumine (tavaline ühtlane jaotus + vearežiimi backoff) tasakaalustab läbilaskevõime optimeerimise ja kaitsemehhanismid. Tavalises režiimis saavutatakse maksimaalne kogumiskiirus, backoff-režiimis välditakse ressursi „ülekuumenemist” olukorras, kus börs on degradeerunud või rakendab ajutisi trahv-limiite.

## WebSocket voogude haldus

WebSocket-ühendused tagavad reaalajas andmeedastuse oluliselt väiksema latentsusega kui REST polling, kuid toovad kaasa operatiivse keerukuse: ühenduse elutsükli haldus, sõnumite järjekorra tagatised (ordering guarantees) ning oleku sünkroniseerimise nõuded. External Bridge teostab platvormispetsiifilisi WebSocket-haldureid (managers), mis kapseldavad ühenduse käsitlemise, tellimuste (subscriptions) halduse ja automaatse taastumise ajutistest riketest.

### Ühenduse elutsükli haldus

WebSocket-haldurid järgivad olekumasina (state machine) mustrit faasidega: lahti ühendatud (disconnected), ühendumas (connecting), ühendatud (connected) ja taasühendumas (reconnecting). Olekumuutused käivituvad nii eksplitsiitsetest API-kõnedest (connect, disconnect) kui ka välistest sündmustest (võrguvead, serveri poolsed sulgemised, heartbeat timeout).

Ühenduse loomisel avatakse WebSocket-transpordikiht, oodatakse kinnitust ja saadetakse tellimuspäringud seadistatud andmevoogudele. Haldur hoiab ootel tellimuspäringute registrit (pending registry), seostades väljaminevad tellimussõnumid sissetulevate kinnitustega (acknowledgments) päringu identifikaatorite abil. See võimaldab tuvastada tellimusi, mis ei saa kinnitust määratud aja jooksul (vaikimisi 5 s).

**Binance’i 24-tunnine ühenduse piirang**: Binance’i WebSocket-dokumentatsioon määratleb maksimaalse ühenduse kestuse 24 tundi, mille järel börs lõpetab ühenduse sunniviisiliselt. Et vältida ootamatuid katkestusi aktiivse turuajal, rakendab External Bridge ennetavat taasühenduse ajastamist: pärast edukat ühendust planeeritakse protsessi restart 23 tunni pärast (1-tunnine turvapuhver)..

**Ühenduse tööaja jälgimine (uptime tracking)**: haldur salvestab ühenduse loomise ajatemplid ja uuendab perioodiliselt meetrikate näidikuid (gauges) jooksva tööajaga. See telemeetria võimaldab jälgida ühenduse stabiilsuse mustreid ja seostada andmelünki ühenduse katkestustega.

### Päringu/vastuse korrelatsioon

Erinevalt REST-ist, kus igal päringul on selge vastus, multipleksivad WebSocket-protokollid mitu loogilist voogu ühe TCP-ühenduse peal. Binance ja Kraken kasutavad erinevaid korrelatsioonistrateegiaid: Binance kasutab numbrilisi päringu ID-sid, Kraken seostab vastused kanali ja sümbolite kombinatsioonidega.

**Binance’i korrelatsioon**: tellimus- ja tühistuspäringute saatmisel omistab haldur monotoonselt kasvavad päringu ID-d ja hoiab „promise-lukke” ootelpäringute registris ID järgi. Sissetulevad sõnumid vastava ID-ga lahendavad (resolve) promise’i, lubades tellimustöövoos oodata kinnitust standardse async/await mustriga. Kui kinnitust ei saabu timeout’i jooksul, promise „lükkub tagasi” (reject) ning haldur logib diagnostikat (sh ootel olevad päringu ID-d), et aidata korrelatsioonirikete analüüsil.

**Kraken’i korrelatsioon**: Kraken’i tellimuskinnitused seostatakse kanalinime ja sümbolite loendi alusel, mitte opaque ID-ga. Haldur konstrueerib liitvõtmed (`${method}-${channel}`) ning hoiab oodatavate kinnituste loendurit, mis võrdub tellimuspäringus olevate sümbolite arvuga. Iga sissetulev kinnitus vähendab loendurit; promise lahendatakse alles siis, kui kõik oodatud kinnitused on saabunud. Selline „partii-korrelatsioon” sobib Kraken’i semantikaga, kus üks tellimuspäring võib tekitada mitu kinnitussõnumit.

### Tellimuskinnituste käsitlemine (WebSocket subscription management)

Tellimustöövood järgivad mustrit: päring → kinnitus (ack) → voog. Klient saadab tellimuse, ootab serveri eksplitsiitset kinnitust ja seejärel töötleb voosõnumeid. Haldur kehtestab kinnitustele timeout’i, et vältida lõputut blokeerumist olukorras, kus börs ei vasta või lükkab sobimatud tellimused tagasi.

Tellimuse vead (vigased sümbolid, toetamata kanalid, rate limit) annavad veateatega kinnituse. Haldur eraldab veakoodid ja -sõnumid, logib struktureeritud veakirjed ning eskaleerib erindi kutsuvasse konteksti, et käivitada korduskatsed või teavitused (alerting).

Edukas kinnitus uuendab meetrikate näidikuid aktiivsete tellimuste arvuga, pakkudes operatiivset nähtavust selle kohta, kui palju eraldiseisvaid andmevoogusid iga WebSocket-ühendus parasjagu edastab.

## Tehinguraamatu järjepidevuse haldus

Tehinguraamat on kumulatiivne olek: iga diferentsiaaluuendus muudab hetkeolukorda, lisades, eemaldades või uuendades hinnatasemeid. Erinevalt olekuvabatest tehingusõnumitest nõuab tehinguraamatu rekonstrueerimine katkestusteta diferentsiaalide jada, alustades tuntud hetktõmmisest. Ühenduse katkemine või sõnumikadu rikub oleku ning nõuab uuesti sünkroniseerimist uue hetktõmmise abil.

### Lünkade tuvastamine diferentsiaalvoogudes

Binance'i tehinguraamatu diferentsiaaluuendused sisaldavad järjestusidentifikaatoreid kahes väljas: `U` (sõnumi esimene update ID) ja `u` (sõnumi viimane update ID). Pidev voog rahuldab invariandi: kahe järjestikuse sõnumi M₁ ja M₂ korral peab kehtima `M₂.U = M₁.u + 1`. Selle invariandi rikkumine tähendab, et sõnumeid on vahelt puudu.

External Bridge WebSocket-protsess hoiab iga sümboli kohta viimase töödeldud `u` väärtust. Uue sõnumi saabumisel võrreldakse selle `U` välja oodatava väärtusega (`viimane_u + 1`). Kui tuvastatakse lünk, peatatakse diferentsiaalide töötlus koheselt ja algatatakse snapshot’i päring.

**Hetktõmmise hankimise töövoog**: lünga korral kutsutakse REST API kliendi hetktõmmise lõpp-punkti, küsides maksimaalset sügavust (1000 hinnataset). Päring teostatakse eksponentsiaalse tagasilöögiga, et taluda ajutisi rikkeid. Pärast kättesaamist salvestatakse hetktõmmis RocksDB-sse ja levitatakse ZeroMQ kaudu, et allavoolu tarbijad saaksid uue baasolukorra.

Kui hetktõmmise salvestus on lõpetatud, jätkatakse diferentsiaalide töötlust ning järjepidevuse referentsiks võetakse hetktõmmise lõpp-update ID. See taastumisjärjestus hoiab tehinguraamatu oleku kooskõlas ka siis, kui WebSocket transpordi kihis esineb katkestusi või sõnumikadu.

## Ajalooliste tehingulünkade täitmine

Kuigi WebSocket vood annavad reaalajas tehinguid minimaalse latentsusega, tekitavad võrguvead või protsessi restart’id ajalisi lünki kogutud tehingujadas. External Bridge rakendab aktiivset lüngatuvastust ja backfilling-mehhanismi: skaneeritakse WebSocket tehingute salvestust, leitakse puuduvad järjestusvahemikud ning hangitakse puuduolevad tehingud REST API ajalooliste tehingute lõpp-punktidest.

### Lüngatuvastuse algoritm

Algoritm kasutab börside poolt antud tehinguidentifikaatorite järjestikulisust: iga tehing saab monotoonselt kasvava ID, mis on sümboli piires unikaalne. Võrreldes salvestatud WebSocket tehingute järjestikuseid ID-sid, tuvastatakse lüngad, kui ID-de vahe on suurem kui 1.

Algoritm töötab iteratiivselt:

1. **Loetakse viimane API-tehingu ID**: RocksDB-st küsitakse kõige värskem tehing, mis on saadud REST API ajalooliste tehingute endpoint’i kaudu. See annab potentsiaalsete lünkade alumise piiri.

2. **Skaneeritakse WebSocket tehingud**: iteratsioon algab globaalsest indeksist, mis vastab API tehingu ID-le. Töödeldakse partiidena (vaikimisi 100 kirjet), et tasakaalustada mälukulu ja iteratsiooni overhead.

3. **Jälgitakse järjestuse kulgu**: hoitakse viidet viimasele täheldatud tehingule (gapStart). Iga uue tehingu korral võrreldakse selle ID-d väärtusega `gapStart.ID + 1`. Kui võrdub, on järjestus pidev; kui suurem, on vahepeal lünk.

4. **Sündmuslingi vabastamine (event loop yielding)**: partii järel antakse kontroll sündmuslingile `await yieldToEventLoop()` abil, kuna RocksDB lugemine on sünkroonne. See väldib Node.js sündmuslingi blokeerimist suuremahulise skaneerimise ajal ning hoiab süsteemi responsiivsena paralleelsete ülesannete jaoks.

5. **Lüngavahemiku fikseerimine**: lünga korral salvestatakse nii pideva jada lõpp (gapStart) kui järgmise jada algus (gapEnd). Nende vahe määratleb puuduvate ID-de vahemiku.

### REST API backfill’i teostus

Kui lüngavahemik on leitud, konstrueeritakse ajalooliste tehingute REST päring järgmiste parameetritega:

- `symbol`: kauplemispaari identifikaator  
- `fromId`: `gapStart.tradeId + 1` (esimene puuduv tehing)  
- `limit`: `min(100, gapEnd.tradeId - fromId)` (API piirangut arvestades)

API tagastab kuni 100 tehingut alates `fromId` väärtusest. Pärija salvestab tehingud püsikihti ja edastab ZeroMQ kaudu samamoodi nagu tavaliste päringute korral. Pärast salvestust jätkub lüngaskaneerimine ning võib tuvastada uusi lünki.

See inkrementaalne strateegia käsitleb suvalise suurusega lünki, tükeldades need API limiidi järgi (100 tehingut päringu kohta). Iteratsioon jätkub, kuni lünki ei ole viimase API tehingu ja kõige värskema WebSocket tehingu vahel; seejärel lülitutakse polling-režiimi, mis kontrollib uusi lünki regulaarselt (vaikimisi 10 s).

**Tehingu ID ja ajatemplite järjestus**: algoritm eeldab, et tehingu ID on sümboli piires rangelt monotoonne, kuid ei eelda ajatemplite ranget järjestust. See sobib börsidega, kus ajatempel võib muutuda (nt arveldusparandused), kuid tehingu ID jääb muutumatuks jada identifikaatoriks.

## Sümbolite normaliseerimine

Krüptobörsid kasutavad erinevaid sümboli nimetamise konventsioone: Binance ühendab alus- ja noteeringuvara (base/quote) ilma eraldajata (BTCUSDT), Kraken kasutab kaldkriipsuga paare (XBT/USDT) ning lisaks oma varanimerakendusi (XBT Bitcoin’i tähistamiseks). External Bridge rakendab normaliseerimiskihi, mis teisendab platvormispetsiifilised sümbolid ühtsesse formaati, et allavoolu komponendid saaksid töödelda mitme börsi andmeid ilma platvormiteadliku loogikata.

### Normaliseeritud sümboliformaat

Normaliseeritud formaat on väiketäheline ja alakriipsuga eraldatud: `{base}_{quote}`. Näited: `btc_usdt`, `eth_usdt`, `sol_usdt`. See annab ühtlase leksikograafilise järjestuse ning lihtsa parsimise ilma börsipõhiste eraldajate teadmata.

### Börsi metaandmete vahemälu

Normaliseerimine nõuab kaardistust platvormispetsiifilisest sümbolist alus- ja noteeringuvaraks. Börsid pakuvad metaandmete endpoint’e, mis kirjeldavad toetatud paare ja varade omadusi. External Bridge hoiab need metaandmed initsialiseerimisel vahemälus (cache) ning värskendab neid perioodiliselt eraldi fetcher-protsessidega.

**Binance Exchange Info**: Binance'i `/api/v3/exchangeInfo` tagastab sümbolite objektide massiivi, millel on väljad `symbol` (nt "BTCUSDT"), `baseAsset` (nt "BTC") ja `quoteAsset` (nt "USDT"). Normaliseerimisfunktsioon leiab sümboli vahemälust tõstutundetul võrdlusel, võtab alus- ja noteeringuvarad ning koostab normaliseeritud identifikaatori.

**Kraken’i Asset Pairs**: Kraken’i metaandmed on keerukamad ja tulevad kahest endpoint’ist: `/0/public/Assets` annab varanimede kaardistused ning `/0/public/AssetPairs` kirjeldab kauplemispaare mitme nimevariandiga. Iga paar sisaldab välju `altname` (lihtsustatud nimi, nt "BTCUSD"), `wsname` (WebSocket nimi, nt "XBT/USD"), `base` ja `quote`. Normaliseerimiskihis hoitakse kahesuunalisi kaarte: wsname → normaliseeritud (WebSocket sõnumite töötluseks) ja normaliseeritud → altname (REST päringuteks).

Kraken kasutab oma varanimetusi: Bitcoin on "XBT" mitte "BTC", "ZUSD" tähistab USD-d, "XXBT" on laiendatud Bitcoin’i identifikaator. Assets endpoint annab `altname` kaardistused, mis teisendavad need tavapärasteks sümboliteks. Normaliseerimiskihis „aheldatakse” kaardistused: kauplemispaar → wsname → base/quote → varade altnames → normaliseeritud base/quote.

### Kahesuunaline normaliseerimine

Süsteem vajab mõlemat suunda:

**Platvormispetsiifiline → normaliseeritud** (sissetulevate andmete töötluseks): WebSocket sõnumites olevad sümbolid normaliseeritakse enne salvestusvõtme koostamist ja ZeroMQ teema (topic) määramist. Nii saavad tellijad küsida andmeid normaliseeritud sümboliga, sõltumata andmeallika börsist.

**Normaliseeritud → platvormispetsiifiline** (API päringute koostamiseks): keskkonnakonfiguratsioon määrab sümbolid normaliseeritult, et konfiguratsioon oleks platvormiagnostiline. Pärija initsialiseerimisel tuleb need teisendada platvormi sümboliteks REST URL-ide ja WebSocket tellimuste jaoks.

Kui sümbolit ei leita metaandmete vahemälust, viskavad kaardistusfunktsioonid erindi ja ebaõnnestuvad kiiresti juba initsialiseerimisel, mitte ei lase vigastel päringutel jõuda börsi API-ni. See väldib vaikseid tõrkeid, mis tekivad trükivigade või toetamata paaride korral.

## Salvestuse varundus ja statistika raporteerimine

Püsisalvestus kogub krüptoturu andmeid kiirusega, mis võib kümnete sümbolite ja mitme börsi korral ületada mitu gigabaiti päevas. External Bridge rakendab automatiseeritud varunduse orkestreerimist ja statistilist monitooringut, et tagada andmete kestvus (durability) ning nähtavus salvestusressursi tarbimisest.

### Varunduse orkestreerimine

Varundusprotsess töötab seadistatava ajakava alusel (vaikimisi iga 3 tunni järel) ja läbib faasid: pakkimine, kontrollsumma (checksum) genereerimine, pilvesünkroniseerimine ja säilituspoliitika jõustamine.

**Pakkimisfaas**: varundusprotsess kasutab süsteemi `tar` utiliiti kogu salvestuskataloogi arhiveerimiseks gzip-pakkimisega. Failinimi kodeerib varunduse ajatembli ISO 8601 formaadis; koolonid ja punktid asendatakse sidekriipsudega failisüsteemi ühilduvuse tagamiseks: `storage-2025-01-15T14-30-00-000.tar.gz`.

Arhiivi loomine toimub voogpakkimisena (streaming compression): failid töödeldakse järjest, ilma et kogu kataloogi sisu mällu laetaks. See hoiab mälukulu piiritletuna sõltumata salvestuse mahust.

**Kontrollsumma genereerimine**: pärast pakkimist arvutatakse arhiiivile SHA-256 krüptograafiline räsi ning salvestatakse `.sha256` kõrvalfaili (sidecar file). Fail sisaldab nii heks-digesti kui ka failinime `sha256sum -c` ühilduvas vormis: `{digest}  {filename}\n`.

Kontrollsumma võimaldab kontrollida terviklust pärast võrgutransporti või pikaajalist säilitust, tuvastades bitt-mädaniku (bit rot) või ülekandekorruptsiooni ilma arhiivi lahtipakkimiseta.

**Ajaloolise säilituse poliitika**: varundussüsteem hoiab maksimaalset varukoopiate arvu (vaikimisi 7). Pärast edukat varundust loetletakse olemasolevad varufailid, sorteeritakse failinimes kodeeritud ajatembli järgi ja kustutatakse vanimad, mis ületavad limiidi.

Lisaks tuvastatakse duplikaadid, mis on loodud samal kuupäeval, ning säilitatakse vaid päeva kõige uuem varukoopia. See deduplikatsioon hoiab ära kettaruumi ammendumise olukordades, kus arenduse/testimise ajal luuakse mitu varundust päevas.

### Pilvesünkroniseerimine

Pilvesünkroniseerimiseks kasutatakse `rclone`’i — käsurea programmi, mis toetab kümneid pilvepakkujaid ühtse liidese kaudu. Töövoog jaguneb kolme faasi: lükatakse lokaalsed varundused pilve, tõmmatakse pilvest puuduolevad varundused lokaali ning rekonsileeritakse (reconcile) kustutades pilvest varundused, mis rikuvad säilituspoliitikat.

**Push-faas**: sünkroniseerija loetleb lokaalsed varufailid (nii `.tar.gz` kui `.sha256`), võrdleb kaugsihtkohas olemasolevaga ja laeb üles ainult puuduvad failid. See vähendab ribalaiuse kulu, vältides korduvat üleslaadimist.

**Pull-faas**: sünkroniseerija loeb pilves olevad varud ja laadib alla need, mis puuduvad lokaalselt. See toetab katastroofitaastet (disaster recovery), kui lokaalne salvestus kaob, kuid pilvevarud jäävad alles.

**Reconcile-faas**: pärast kahesuunalist sünkroniseerimist rakendatakse säilituspoliitikat pilves, kustutades varundused, mis ületavad maksimaalse arvu. See hoiab pilvesalvestuse kulud piiritletuna, säilitades samas piisava ajaloo taastamiseks.

Sünkroniseerimine toimub ajutises „staging” kataloogis: enne pilveoperatsioone kopeeritakse varud sinna. See isolatsioon välistab olukorra, kus sünkroniseerimisrike kahjustab primaarset varunduskataloogi.

### Salvestusstatistika kogumine

Statistikaraporteerija skaneerib perioodiliselt kataloogipuud, akumuleerides failide arvu ja kogumahu iga andmekategooria kohta (platvorm, endpoint, sümbol). Statistika avalikustatakse Prometheus meetrikate näidikutena, mis võimaldab jälgimisvaadetel (dashboards) visualiseerida salvestuse kasvukiirust ja leida sümboleid, mis tarbivad ebaproportsionaalselt palju kettaruumi.

Teostus kasutab rekursiivset kataloogiläbimist ja mustripõhist kategoriseerimist. Näiteks teed, mis sobivad mustriga `external-bridge/binance/ws_trade/{symbol}`, liigitatakse kategooriasse `external-bridge/binance/ws_trade`. Faili metaandmed (maht, muutmise ajatempel) summeeritakse kategooriapõhistesse „ämbrikestesse” (buckets).

Statistika kogumine toimub asünkroonselt perioodilise ajakava alusel (vaikimisi iga 60 s) sõltumatult andmete sissevõtust. Eraldatud protsess tagab, et statistika kogumine ei mõjuta reaalaja kogumise latentsust.

Kogutud statistika uuendab Prometheus meetrikaid, sh:
- `storage_directory_size_bytes{directory}`: kategooria kogumaht baitides  
- `storage_directory_file_count{directory}`: failide arv kategoorias  
- `storage_directory_last_updated_timestamp{directory}`: viimane muutmise aeg  

Need meetrikad toetavad proaktiivset kapasiteedimonitooringut, teavitamist kasvutrendide alusel ning retentsioonipoliitika rikkumiste tuvastamist.

## Keskkonnapõhine konfiguratsioon

External Bridge konfiguratsioon on deklaratiivne ja põhineb TypeBox skeemidel, mis pakuvad nii runtime-valideerimist kui ka compile-time tüübiinferentsi. Parameetrid pärinevad ainult keskkonnamuutujatest (environment variables), mis sobib konteinerpõhise juurutusega ja hõlbustab saladuste (secrets) haldust (Kubernetes secrets, AWS Parameter Store jne).

### Sümbolite konfiguratsioon

Keskkonnamuutuja `SYMBOLS` võtab vastu komadega eraldatud normaliseeritud kauplemispaaride loendi: `btc_usdt,eth_usdt,sol_usdt`. Initsialiseerimisel parsitakse see massiiviks, valideeritakse metaandmete vahemälu vastu ja lahendatakse platvormispetsiifilised sümbolid normaliseerimiskihi abil.

See võimaldab sümbolite komplekti muutmist ilma koodi muutmata või rakendust uuesti ehitamata: uue paari lisamiseks piisab keskkonnamuutuja uuendamisest ja vastavate protsesside restart’ist.

### Platvormispetsiifilised parameetrid

Kiiruspiirangud erinevad börsiti drastiliselt: näiteks Binance võib lubada autentitud kliendile 2400 päringut minutis, Kraken võib piirata autentimata päringuid 1 päring sekundis. External Bridge eksponeerib platvormipõhised parameetrid keskkonnamuutujatena:

- `RATE_LIMIT_MAX_REQUESTS`: maksimaalne päringute arv aknas  
- `RATE_LIMIT_WINDOW_MS`: akna kestus millisekundites  

Pärijad initsialiseerivad kiiruspiirajad nende parameetritega konteksti loomisel. See võimaldab operaatoritel kohandada limiteid börsi poliitikamuutuste või konto taseme muutuste korral ilma koodi muutmata.

Sarnane parameetriseerimine kehtib WebSocket URL-idele (`WSS_BASE_URL`), REST API baas-URL-idele (`API_BASE_URL`), autentimisandmetele (`API_KEY`, `API_SECRET`) ja salvestusteedele (`STORAGE_BASE_DIR`). See välistab „hardcode’i” ning toetab börside erikeskkondadega lihtsat ühendamist.

## Kokkuvõte

External Bridge realiseerib robustse ja skaleeruva andmekogumise kihi, mis võtab reaalajas turuandmeid mitmest krüptobörsist ning säilitab tervikluse tagatised (integrity guarantees), mis on vajalikud allavoolu masinõppe rakendustele. Protsessipõhine isoleerimine võimaldab sõltumatut skaleerimist ja tõrketaluvust, samal ajal kui lünkade tuvastus ja täitmine (gap filling) tagavad andmete täielikkuse ka võrgu- või API-rikete korral.

Disain rõhutab operatiivset lihtsust: väljastatud konfiguratsioon, automatiseeritud varundus, ning põhjalik meetrikate ekspositsioon. Sümbolite normaliseerimine abstraheerib platvormispetsiifilisi nimetusi ja annab allavoolule ühtse liidese. Kiiruspiiramine ja eksponentsiaalne backoff kaitsevad kvootide ammendumise eest, säilitades samas maksimaalse kogumiskiiruse.

Selline arhitektuur loob aluse deterministlikule offline taasesitusele (deterministic offline replay), mis on masinõppe treeningandmete reprodutseeritavuse seisukohalt kriitiline. RocksDB püsikiht, lüngatäitmise algoritmid ja orderiraamatu järjepidevuse haldus koos tagavad, et kogutud andmestik moodustab täielikud ja ajaliselt järjestatud (temporally ordered) jadad, mis sobivad aegridade analüüsiks ja ennustavate mudelite loomiseks.
