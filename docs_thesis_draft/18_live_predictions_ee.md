# Reaalajas ennustussüsteem: voogedastuspõhine ansamblipõhine järeldamine hinnamuutuste prognoosimiseks

Käesolev peatükk tutvustab reaalajas ennustussüsteemi, mis muundab võrguühenduseta treenitud masinõppemudelid voogedastuspõhiseks järelduskonveieriks (*streaming inference pipeline*), mis on võimeline tootma pidevaid hinnamuutuste prognoose reaalajas turuandmetest. Arhitektuur käsitleb tootmismasinõppe juurutamise põhilisi väljakutseid: kaheallikaandmete sünkroniseerimine, mälupõhine tunnuspuhvri (*feature buffer*) haldamine piiratud mälumahuga, mudelite ansambli (*ensemble*) orkestratsioon täpsusele optimeeritud spetsialistide valikuga ning lävipõhine suunaline süntees, mis kombineerib mitu binaarset klassifitseerijat tegutsetavateks kauplemissignaalideks. Süsteem säilitab range ajalise joonduse tehingute täitmise ja orderiraamatu andmevoogude vahel, rakendab järeldusajal spetsialistispetsiifilisi tunnuste teisendusi ning kasutab häälteenamust (*majority voting*) täpsuskaalutud usaldusväärsuse hindamisega robustsete ennustuste loomiseks. Eksperimentaalne hindamine demonstreerib alla sekundi jäävat ennustuslatentsust, mis sobib algoritmilise kauplemise rakendusteks.

## 1. Sissejuhatus

Üleminek võrguühenduseta mudeli treenimiselt tootmisjuurutamisele kujutab endast kriitilist etappi masinõppesüsteemide arenduses, eriti ajatundlike finantsrakenduste puhul. Kui eelmine peatükk kirjeldas mudeli treenimist ajalooliste andmetega, siis käesolev peatükk käsitleb reaalajas järeldamise (*live inference*) erinevaid insenertehnilisi väljakutseid: voogedastusandmete tarbimine, ajalise järjepidevuse säilitamine, mälupiirangute haldamine ning mitme spetsialisti ennustuste kombineerimine sidusateks kauplemissignaalideks.

Reaalajas ennustussüsteem tegutseb voogtöötluse (*stream processing*) ja masinõppejäreldamise ristumiskohas, võttes vastu aknaagregatsioonid ülesvoolu tunnustöötajatelt, kogudes piisavat ajalist konteksti tagasivaatepõhiste (*lookback-based*) tunnuste jaoks, rakendades mudelispetsiifilisi teisendusi ning genereerides ennustusi tulevaste hinnamuutuste kohta. Erinevalt paketttöötlusest (*batch inference*), kus kõik andmed on korraga kättesaadavad, peab voogedastuspõhine järeldamine toime tulema asünkroonse andmete saabumise, mittetäielike akende ning piiratud mälutarbimise nõudega.

### 1.1 Süsteeminõuded

Tootmisennustussüsteem peab rahuldama mitmeid operatsioonilisi piiranguid:

1. **Ajaline joondamine**: Tehingu- ja orderiraamatu aknad peavad olema sünkroniseeritud enne ennustamist, hoolimata potentsiaalselt asünkroonsest saabumisest sõltumatutest andmeallikatest
2. **Piiratud mälu**: Tunnuspuhvrid peavad säilitama fikseeritud maksimaalse suuruse, loobudes vanematest vaatlustest, et vältida piiramata kasvu pideva töö ajal
3. **Madal latentsus**: Ennustused peavad olema genereeritud millisekundite jooksul pärast akna valmimist, et võimaldada õigeaegseid kauplemisotsuseid
4. **Graatsiline degradatsioon**: Puuduvad aknad ei tohiks põhjustada süsteemi tõrkeid; ennustused peaksid kasutama parimate saadaolevaid andmeid
5. **Täpsuse kalibreerimine**: Mudeli usaldusväärsuse hinnangud peavad kajastama empiirilist täpsust (*precision*), mitte ainult ennustuste sagedust
6. **Tõlgendatav väljund**: Toored binaarsed ennustused peavad olema sünteesitud tegutsetavateks suunasignaalideks koos suurusvahemikega

### 1.2 Arhitektuuriline ülevaade

Reaalajas ennustussüsteem koosneb neljast peamisest komponendist:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Tunnuspuhver   │────▶│ Spetsialistide  │────▶│ Ansambli        │────▶│ Ennustuste      │
│  (Voogedastus)  │     │ Grupid          │     │ Agregeerimine   │     │ Kombineerija    │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │                       │
   Kaheallikaline          Top-K mudelid            Häälte-               Vahemiku/Suuna
   sünkroniseerimine       sihtmärgi kohta          enamus                süntees
```

Iga komponent käsitleb voogedastuspõhise järeldamise probleemi konkreetset aspekti, pakkudes puhtaid liideseid, mis võimaldavad sõltumatut testimist ja optimeerimist.

## 2. Tunnuspuhvri haldamine

Klass `FeatureBuffer` haldab mälupõhist repositooriumi valmis aknaagregatsioonidest, pakkudes ajalist konteksti, mida vajatakse tagasivaatepõhiste tunnuste eraldamiseks.

### 2.1 Andmestruktuuri disain

Puhver kasutab Polars DataFrame'i (*andmeraami*) oma põhilise salvestusmehhanismina:

```python
@dataclass
class FeatureBuffer:
    platform: str
    symbol: str
    window_size_ms: int
    df: pl.DataFrame = field(default_factory=lambda: pl.DataFrame())
    pending_trade: dict[int, dict] = field(default_factory=dict)
    pending_order: dict[int, dict] = field(default_factory=dict)
```

Disain eraldab kolm andmekategooriat:

| Kategooria | Salvestus | Eesmärk |
|------------|-----------|---------|
| Valmis aknad | `df` (DataFrame) | Täielikult joondatud tehingu + orderi tunnused |
| Ootel tehing | `pending_trade` (dict) | Tehingutunnused, mis ootavad orderi vastaspoolt |
| Ootel order | `pending_order` (dict) | Orderitunnused, mis ootavad tehingu vastaspoolt |

Selline eraldamine võimaldab asünkroonsete saabumiste tõhusat käsitlemist: kumb iganes allikas saabub esimesena, puhverdatakse ootel sõnastikku (*pending dictionary*), kuniks selle vastand kategooria saabub.

### 2.2 Kaheallikaline sünkroniseerimine

Tehingu ja orderiraamatu tunnusvood pärinevad sõltumatutelt töötajatelt, mis töötlevad erinevaid andmetüüpe. Hoolimata jagatud aknapiiridest (`window_end_ms`), põhjustavad võrgulatentsus ja töötlusaja variatsioonid tunnuste asünkroonset saabumist.

Puhver rakendab koordinatsiooniprotokolli, kus mõlema allika andmete saabumine käivitab valmimise kontrolli. Kui tehingu või orderi tunnused saabuvad, salvestatakse need vastavasse ootel sõnastikku ja proovitakse akent valmis lugeda. Valmimiskontroll kontrollib, kas antud aknale on mõlemad allikad andmed esitanud: kui mõni pooltest puudub, jääb aken ooteseisundisse. Kui mõlemad tunnuste komplektid on saabunud, kombineeritakse need üheks reaks ja lisatakse DataFrame'i ning ootel andmed eemaldatakse.

**Valmimissemantika**: Akent loetakse valmiks ainult siis, kui nii tehingu kui ka orderi tunnused on saabunud. Valmimise kontrolli meetod tagastab edukuse tõeväärtuse, võimaldades ülesvoolu orkestratsiooni käivitada ennustusi täpselt siis, kui uued andmed muutuvad kättesaadavaks.

### 2.3 Mälupiirangu jõustamine

Pidev voogedastustöö nõuab piiratud mälutarbimist. Puhver jõustab maksimaalse suuruse 5000 akent: iga kord kui uus täielik aken lisatakse ja DataFrame'i suurus ületab limiiti, eemaldatakse vanemad read, säilitades ainult viimased 5000 akent. See libiseva akna lähenemine tagab konstantse mälutarbimise sõltumata töötamisajast. 30-sekundiliste akende puhul esindab 5000 kirjet ligikaudu 42 tunni andmeid – piisav teisenduste konteksti jaoks, säilitades samal ajal fikseeritud ~50MB mälujälje sümboli kohta.

### 2.4 Aegunud ootel olevate andmete puhastamine

Puuduvad andmed (võrgutõrked, börsi katkestused) võivad põhjustada ootel sõnastike piiramatut kasvu. Puhver rakendab perioodilist puhastamist, eemaldades ootel sõnastikest aknad, mis on vanemad kui 10× akna suurus (5 minutit 30-sekundiliste akende puhul). See lähenemisviis aktsepteerib andmekadu piiratud mälu vastu: kui andmed ei saabu mõistliku aja jooksul, eeldatakse, et nende aken on püsivalt puudulik ja seda ei ole mõtet mälus hoida.

### 2.5 Puhvri initsialiseerimine

Soekäivituse (_warm-start_) stsenaariumide jaoks saab puhvri initsialiseerida ajaloolistest Parquet andmetest. Ajalooandmete laadimisel filtreeritakse need konkreetse platvormi, sümboli ja aknasuuruse kombinatsiooni jaoks, sorteeritakse kronoloogilises järjekorras ja kärbitakse maksimaalse puhvri suuruseni. See võimaldab ennustussüsteemil alustada ennustuste genereerimist kohe käivitumisel, ilma puhvri kogunemist ootamata: süsteem omab kohe piisavalt ajaloolist konteksti tunnuste transformatsioonide ja tagasivaate akende jaoks.

## 3. Spetsialistide ansambli arhitektuur

Süsteem laeb mitu treenitud mudelit ennustussihtmärgi kohta, organiseerituna täpsusele optimeeritud gruppidesse.

### 3.1 Spetsialisti andmestruktuur

Iga spetsialist kapseldab treenitud mudeli koos selle metaandmetega:

```python
@dataclass(slots=True)
class Specialist:
    ml_tree_result_id: int           # Andmebaasi viide
    clf: DecisionTreeClassifier      # Scikit-learn mudel
    used_features: list[str]         # Tunnusgrupi nimed
    used_features_lookback: int      # Ajaline konteksti sügavus
    transformation: str              # Rakendatud teisendusstrateegia
    precision_neg: float             # Täpsus negatiivsel klassil
    precision_pos: float             # Täpsus positiivsel klassil
```

Optimiseering `slots=True` vähendab mälukoormust objektide puhul, mida instantseeritakse suurtes kogustes.

### 3.2 Kahekordne täpsuse optimeerimine

Tasakaalustamata klassifikatsiooni puhul teenib täpsus (*precision*) erinevatel klassidel erinevaid eesmärke:

- **Kõrge negatiivne täpsus**: Mudel on usaldusväärne, kui ennustab "lävendi ületamist ei toimu" (vältides valepositiivseid riskihinnangus)
- **Kõrge positiivne täpsus**: Mudel on usaldusväärne, kui ennustab "lävendi ületamine toimub" (vältides valepositiivseid kauplemissignaalides)

Süsteem laadib eraldi spetsialistide ansamblid, mis on optimeeritud kummalegi eesmärgile:

```python
@dataclass(slots=True)
class SpecialistGroup:
    target_name: str
    neg_specialists: list[Specialist]  # Top-K precision_neg järgi
    pos_specialists: list[Specialist]  # Top-K precision_pos järgi
```

### 3.3 Andmebaasist laadimine

Spetsialistid laaditakse täpsuse järgi järjestatud päringute kaudu. Süsteem teeb kaks eraldi päringut PostgreSQL andmebaasi vastu: esimene päring hangib top-K mudelit, mis on järjestatud negatiivse täpsuse järgi laskuvas järjekorras, teine päring hangib top-K mudelit positiivse täpsuse järgi. Mõlemad päringud filtreerivad tulemused konkreetse platvormi, sümboli ja sihtmärgi kombinatsiooni järgi. Iga mudeli kohta laaditakse metaandmed: kasutatud tunnused, tagasivaate sügavus, transformatsiooni strateegia ning mõlemad täpsusväärtused.

**Kattuvuse käsitlemine**: Sama mudel võib ilmuda mõlemas loendis, kui see on silmapaistev mõlema täpsusmõõdiku osas. See on vastuvõetav – mudel panustab mõlemasse ansambliprognoos, kaalutuna vastava täpsusega.

### 3.4 Mudeli deserialiseerimine

Treenitud scikit-learn mudelid salvestatakse PostgreSQL-is joblib-serialiseeritud baitidena. Mudeli laadimine toimub läbi `ml_tree_artifact` tabeli pärimise, kus mudelid on salvestatud binaarkujul. Pärast binaardemete lugemist deserialiseeeritakse need `joblib` teegi abil tagasi scikit-learn objektideks. Joblib deserialiseerimine rekonstrueerib täieliku otsustuspuu struktuuri, sealhulgas jaotuslävendid, tunnusindeksid ja lehtede ennustused.

### 3.5 Tunnusindeksi kaardistamine

Spetsialistid kasutavad heterogeenseid tunnuste alamhulki. Tõhusa veeruvaliku võimaldamiseks ilma korduvate stringiotsinguteta ehitab süsteem eelnevalt indeksikaardi. Indeksikaart luuakse genereerides kõik võimalikud tunnuste nimed tagasivaate nihkete alusel (nt `-12` kuni `0`), seejärel luues kaardistuse tunnusgrupi nimede (nt `t_sum_vol`) ja vastava veeru indeksite massiivi vahel. See võimaldab konstantse aja keerukusega O(1) veergude indeksite otsingut mistahes tunnusgrupi jaoks, mis on kriitilise tähtsusega madala latentsusega järeldamise jaoks.

## 4. Üksiku spetsialisti ennustamine

Iga spetsialist rakendab oma spetsiifilist tunnuste valikut ja teisendust enne ennustuse genereerimist.

### 4.1 Tunnusveergude eraldamine

Antud täieliku vaatlusmaatriksi ja eelnevalt ehitatud indeksikaardi korral eraldatakse spetsialistispetsiifilised tunnused. Iga spetsialisti kasutatud tunnusgrupi nime jaoks leitakse indeksikaardist vastav veergude indeksite loend ja need kogutakse ühisesse nimekirja. Seejärel valitakse täielikust maatriksist ainult need veerud, mis vastavad spetsialisti tunnuste alamhulgale. Kui spetsialist kasutab tunnuseid `["t_sum_vol", "o_sw_imb"]` tagasivaatega 12, eraldab see 26 veergu (13 ajalist nihet × 2 tunnusgruppi).

### 4.2 Teisenduse rakendamine

Spetsialisti teisendusstrateegia rakendatakse, kasutades kontekstina täielikku puhvrit. Valitud tunnused jagatakse kaheks: treenimiskontekstiks (täielik puhver) ja testandmeteks (ainult viimane vaatlus). Seejärel rakendatakse spetsialistile määratud transformatsiooni strateegiat, mis võib olla z-skoori normaliseerimine, Fibonacci-viitepõhised astmelised või nende kombinatsioonid. Z-skoori normaliseerimise puhul arvutab see puhvrist keskmise ja standardhälbe, seejärel normaliseerib viimase vaatluse. Fibonacci-viivitusega astmeliste puhul loob see momentumindikaatoreid üle ajalise dimensiooni.

### 4.3 Ennustuse genereerimine

Teisendatud tunnused vormindatakse ümber üherealiseks maatriksiks ja edastatakse scikit-learn klassifitseerijale ennustuse genereerimiseks. Ennustus on binaarne täisarv: 0 (lävendi ületamist ei oodata) või 1 (lävendi ületamist oodatakse).

## 5. Häälteenamuse agregeerimine

Mitu spetsialisti ennustust kombineeritakse häälteenamuse (*majority voting*) kaudu täpsuskaalutud usaldusväärsusega.

### 5.1 Häälte lugemine

Iga spetsialistide grupi (negatiivsele või positiivsele optimeeritud) kohta agregeeritakse ennustused. Süsteem loendab, mitu spetsialisti ennustab klassi 0 ja mitu klassi 1. Enamushääl määratakse võrdluse põhjal: kui rohkem spetsialiste ennustab klassi 1, on tulemus 1, vastasel juhul 0.

**Viikide lahendamine**: Võrdsete häälte korral vaikimisi kasutab süsteem klassi 0 (lävendi ületamist ei toimu), rakendades konservatiivset kallutust, mis sobib riskitundlikele rakendustele.

### 5.2 Täpsuskaalutud usaldusväärsus

Ansambli usaldusväärsus arvutatakse kui nõustuvate spetsialistide täpsuse keskmine. Süsteem itereerib läbi kõigi spetsialistide ja nende ennustuste, kogudes täpsuse väärtused nendelt spetsialistidelt, kelle ennustus ühtib enamushäälega. Seejärel arvutatakse nende täpsuste keskmine usaldusväärsuse väärtuseks ning nõustumise määraks arvutatakse nõustuvate spetsialistide suhe koguhulgast. See kaalumine tagab, et usaldusväärsus kajastab empiirilist usaldusväärsust: kui kolm spetsialisti täpsustega 0.8, 0.9 ja 0.7 kõik ennustavad klassi 1, on usaldusväärsus 0.8 (keskmine), mitte lihtsalt "100% nõustumine".

### 5.3 Kahekordse ansambli väljund

Iga sihtmärgi kohta genereerivad nii negatiivne kui ka positiivne ansambel sõltumatud ennustused. Protsess hõlmab üksikute ennustuste genereerimist igalt negatiivse optimeeringuga spetsialistilt ja igalt positiivse optimeeringuga spetsialistilt. Seejärel agregeeritakse mõlemad ennustuste kogumid eraldi, kasutades vastavat täpsusmõõdikut (negatiivset või positiivset) usaldusväärsuse arvutamiseks. Tulemuseks on kahekordne ennustus: negatiivne ansambel toodab ennustuse koos negatiivse usaldusväärsuse ja nõustumisega, positiivne ansambel toodab ennustuse koos positiivse usaldusväärsuse ja nõustumisega. See toodab kaks potentsiaalselt erinevat ennustust sihtmärgi kohta, millest kumbki on kalibreeritud oma optimeerimiseesmärgi jaoks.

## 6. Lävipõhine suunaline süntees

Üksikud sihtmärgi ennustused (nt "kõrgpunkt tõuseb 0.05%") tuleb sünteesida tegutsetavateks signaalideks (nt "hind tõenäoliselt tõuseb 0.05-0.09%").

### 6.1 Sihtmärgi nime parsimine

Sihtmärkide nimed järgivad struktureeritud konventsiooni formaadis `target_{price_type}_{direction}_{threshold}p`. Parsimine toimub nime jagamisega alamjärjestusteks: hinnatüüp (`high` või `low`), suund (`up` või `down`) ja lävi (protsentuaalne väärtus ilma `p` sufiksita). Näiteks `target_high_up_0.05p` parsitakse kolmeks komponendiks: `("high", "up", 0.05)`. See parsimine võimaldab ennustusi grupeerida nende semantilise tähenduse järgi.

### 6.2 Vahemiku tuletamine

Mitmetest lävenditest tuletab süsteem oodatavad liikumisvahemikud. Protsess algab asjakohaste ennustuste filtreerimisega konkreetse hinnatüübi ja suuna jaoks, sorteerides need läve järgi kasvavalt. Seejärel itereeritakse läbi sorteeritud lävede, otsides neid, kus positiivne ennustus on 1 ja mudeli nõustumine on vähemalt 50%. Esimene selline lävi määrab vahemiku alumise piiri, viimane selline lävi määrab ülemise piiri. Kui leidub lävend, mis jääb pärast maksimaalset positiivset lävendit ja mida ei ennustata, kasutatakse seda vahemiku ülemise piirina. Kui ühtegi positiivset ennustust ei leidu, tagastatakse `None`.

**Nõustumise lävend**: Ainult ennustused, kus mudeli nõustumine on ≥50%, panustavad vahemiku tuletamisse, filtreerides välja madala usaldusväärsusega signaalid.

**Vahemiku semantika**: Kui lävendid 0.02, 0.05, 0.09 kõik ennustavad positiivset ja 0.14 ennustab negatiivset, on vahemik (0.02, 0.14) – näidates oodatavat liikumist vahemikus 0.02% kuni 0.14%.

### 6.3 Suunaline klassifitseerimine

Üles/alla vahemike olemasolu või puudumine määrab üldise suuna. Loogika kontrollid tehakse järgmises järjekorras: kui mõlemad vahemikud eksisteerivad, klassifitseeritakse suund kui "volatile" (vastuolulised signaalid); kui ainult üles vahemik eksisteerib, on suund "up"; kui ainult alla vahemik eksisteerib, on suund "down"; kui kumbki vahemik ei eksisteeri, on suund "stable" (ühtegi lävendit ei ennustatud).

| Üles vahemik | Alla vahemik | Suund | Tõlgendus |
|--------------|--------------|-------|-----------|
| Olemas | Puudub | "up" | Ühesuunaline tõusev liikumine oodatud |
| Puudub | Olemas | "down" | Ühesuunaline langev liikumine oodatud |
| Olemas | Olemas | "volatile" | Suur liikumine oodatud, suund ebakindel |
| Puudub | Puudub | "stable" | Märkimisväärset liikumist ei oodata |

### 6.4 Usaldusväärsuse hindamine

Usaldusväärsuse arvutamine varieerub ennustatud suuna järgi. Suuna "stable" korral arvutatakse keskmine negatiivne nõustumine kõigi asjakohaste sihtmärkide üle, kus negatiivne ennustus on 0. Suuna "volatile" korral tagastatakse fikseeritud väärtus 0.5, kajastades fundamentaalset ebakindlust suuna osas. Suundade "up" või "down" puhul arvutatakse keskmine positiivne usaldusväärsus nendelt ennustustelt, mis vastavad konkreetsele hinnatüübile ja suunale ning kus positiivne ennustus on 1.

**Stabiilsuse usaldusväärsus**: Mõõdab, kui järjepidevalt mudelid ennustavad liikumise puudumist kõigi lävendite lõikes.

**Suunaline usaldusväärsus**: Keskmistab täpsuskaalutud usaldusväärsuse mudelitelt, mis ennustavad konkreetset suunda.

**Volatiilne usaldusväärsus**: Fikseeritud 0.5 juures, kajastades fundamentaalset ebakindlust suuna osas.

## 7. Reaalajas ennustamise orkestratsioon

Klass `LivePredictor` integreerib kõik komponendid sidusaks järelduskonveieriks.

### 7.1 Initsialiseerimine

Klass `LivePredictor` initsialiseeritakse tunnuspuhvriga, platvormi, sümboli ja akna suuruse määrangutega ning valikulise tagasivaate sügavusega (vaikimisi 12 akent). Initsialiseerimise käigus luuakse tühi sõnastik spetsialistide gruppide hoidmiseks, arvutatakse tunnuste indeksikaart ning määratakse maksimaalne treeningu andmete pikkus 2000 aknale. Tunnuste indeksikaart arvutatakse üks kord initsialiseerimisel, vältides korduvat arvutamist järeldamise ajal.

### 7.2 Mudelite laadimine

Kõik sihtmärgi sümboli spetsialistid laaditakse andmebaasist. Protsess algab kõigi erinevate sihtmärkide nimede pärimisega konkreetse platvormi ja sümboli kombinatsiooni jaoks. Iga sihtmärgi jaoks laaditakse spetsialistide grupp (top-K negatiivse ja positiivse täpsuse mudelid). Kui grupp sisaldab vähemalt ühte spetsialisti, lisatakse see süsteemi. Paralleelselt jälgitakse kõigi spetsialistide maksimaalset treeningu andmete pikkust, pärides selle andmebaasist iga mudeli jaoks. Lõpuks määratakse süsteemile maksimaalne treeningandmete pikkus, mis võrdub leitud maksimumiga või vaikeväärtusega 2000. Maksimaalne treeningandmete pikkus tagab, et teisenduse kontekst vastab treenimistingimustele.

### 7.3 Voogedastuse uuendused

Andmed saabuvad tagasikutsemeetodite kaudu, mis edastavad saabuvad aknatunnused otse tunnuspuhvrile. On kaks eraldi meetodit: üks tehingu akende jaoks, teine orderi akende jaoks. Mõlemad võtavad vastu akna lõpuaja millisekundites ja tunnuste sõnastiku, edastades need vastavale puhvri meetodile. Tagastusväärtus näitab akna valmimist, võimaldades ülesvoolu koodil käivitada ennustusi ainult siis, kui uued andmed on saadaval.

### 7.4 Ennustuse genereerimine

Põhiline ennustusmeetod orkestreerib kogu konveieri. Protsess algab piisavuse kontrolliga: puhver peab sisaldama vähemalt tagasivaate sügavuse pluss üks akent ning peab olema laaditud vähemalt üks spetsialistide grupp. Seejärel lõigatakse puhvrist viimased N akent (kus N on väiksem maksimaalsest treeningu andmete pikkusest ja puhvri suurusest), et pakkuda piisavat konteksti transformatsioonidele ilma kogu puhvrit töötlemata. Lõikele rakendatakse ajalist joondamist k-nihke liitmiste kaudu, luues tagasivaateveerud. Joondatud andmed lamendatakse NumPy massiiviks. Arvutatakse ennustuse ajatempel, lisades praeguse akna lõpuajale kolm akna suurust (90 sekundit 30-sekundiliste akende puhul). Genereeritakse ennustused iga laaditud sihtmärgi jaoks, kasutades vastava spetsialistide gruppi. Lõpuks kombineeritakse kõik üksikud sihtmärgi ennustused üheks kokkuvõtteks, mis sisaldab nii granulaarset kui ka sünteesitud informatsiooni.

### 7.5 Ennustushorisont

Ennustused sihtivad konkreetset tulevast ajatemplit:

$$
t_{\text{ennustus}} = t_{\text{akna\_lõpp}} + 3 \times \text{akna\_suurus}
$$

30-sekundiliste akende puhul toodab see ennustusi 90 sekundit ette, vastates treeningu sihtmärgi horisondile (lõdvendatud sobitamine üle akende 1-3).

## 8. Ennustuse väljundformaat

Süsteem toodab struktureeritud väljundit, mis sobib allavoolu tarbimiseks.

### 8.1 Sihtmärgipõhised ennustused

```python
@dataclass(slots=True)
class TargetPrediction:
    prediction_for_timestamp: datetime
    platform: str
    symbol: str
    target_name: str
    neg_prediction: int           # 0 või 1 neg-optimeeritud ansamblilt
    neg_confidence: float         # Täpsuskaalutud usaldusväärsus
    neg_model_agreement: float    # Nõustuvate mudelite osakaal
    pos_prediction: int           # 0 või 1 pos-optimeeritud ansamblilt
    pos_confidence: float
    pos_model_agreement: float
```

Iga sihtmärk toodab kahekordse ennustuse, võimaldades tarbijatel valida vastavalt oma riskiprofiilile:
- **Riskikartlik**: Kasuta `neg_prediction` (optimeeritud vältima valenegatiivseid)
- **Signaali otsiv**: Kasuta `pos_prediction` (optimeeritud kinnitama positiivseid)

### 8.2 Ennustuste kokkuvõte

```python
@dataclass(slots=True)
class PredictionSummary:
    prediction_for_timestamp: datetime
    platform: str
    symbol: str
    predictions: dict[str, TargetPrediction]  # Kõik üksikud ennustused
    
    high_up_range: tuple[float, float] | None     # Oodatav kõrgpunkti tõus
    high_down_range: tuple[float, float] | None   # Oodatav kõrgpunkti langus
    high_direction: Literal["up", "down", "volatile", "stable"]
    high_confidence: float
    
    low_up_range: tuple[float, float] | None
    low_down_range: tuple[float, float] | None
    low_direction: Literal["up", "down", "volatile", "stable"]
    low_confidence: float
```

Kokkuvõte pakub nii granulaarset (sihtmärgi kohta) kui ka sünteesitud (suunalist) vaadet:

**Näidisväljund:**
```python
PredictionSummary(
    prediction_for_timestamp=datetime(2025, 1, 15, 12, 30, 0),
    platform="kraken",
    symbol="eth_usdt",
    predictions={...},  # 20 üksikut sihtmärgi ennustust
    high_up_range=(0.05, 0.14),
    high_down_range=None,
    high_direction="up",
    high_confidence=0.78,
    low_up_range=(0.02, 0.09),
    low_down_range=None,
    low_direction="up",
    low_confidence=0.65
)
```

See näitab: "Nii kõrg- kui madalpunktide hinnad oodatavalt tõusevad; kõrgpunkt tõenäoliselt tõuseb 0.05-0.14% 78% usaldusväärsusega."

## 9. Jõudluskarakteristikud

### 9.1 Latentsusprofiil

| Operatsioon | Tüüpiline latentsus | Pudelikael |
|-------------|---------------------|------------|
| Puhvri uuendamine | < 1 ms | DataFrame'i konkatenatsioon |
| k-nihke ühendused | 5-10 ms | Polars join operatsioonid |
| Tunnuste lamedaks tegemine | 2-5 ms | NumPy massiivi konstrueerimine |
| Ühe spetsialisti ennustus | 0.5-1 ms | Otsustuspuu läbimine |
| Täielik ennustus (20 sihtmärki × 6 spetsialisti) | 50-100 ms | Agregaat |

Kogu ennustuse latentsus jääb alla 100ms, mis sobib 30-sekundilise akna kadentsile.

### 9.2 Mäluprofiil

| Komponent | Mälukasutus | Märkused |
|-----------|-------------|----------|
| Tunnuspuhver (5000 rida) | ~50 MB | Polars DataFrame |
| Spetsialistmudelid (120 kokku) | ~10 MB | Otsustuspuud |
| Tunnuste indeksikaart | < 1 MB | Sõnastik |
| Teisenduspuhvrid | ~5 MB | Ajutised NumPy massiivid |
| **Kokku sümboli kohta** | **~70 MB** | Piiratud MAX_BUFFER_SIZE poolt |

### 9.3 Skaleeritavus

Mitme sümboli juurutamine skaleerub lineaarselt:
- 10 sümbolit: ~700 MB mälu, sõltumatud ennustusvood
- Mudeleid saab jagada sümbolite vahel, kui treenitud ühendatud andmetel
- Ennustuste genereerimine on piinlikult paralleelne (*embarrassingly parallel*) sümbolite lõikes

## 10. Integratsioon kauplemissüsteemidega

### 10.1 Signaali tõlgendamine

Allavoolu kauplemissüsteemid tõlgendavad ennustusi suuna ja usaldusväärsuse alusel:

| Suund | Usaldusväärsus | Tegevus |
|-------|----------------|---------|
| "up" | > 0.7 | Kaaluda pikka positsiooni |
| "down" | > 0.7 | Kaaluda lühikest positsiooni |
| "stable" | > 0.6 | Hoida või vähendada ekspositsiooni |
| "volatile" | ükskõik | Suurendada positsiooni suuruse ettevaatlikkust |

### 10.2 Vahemiku kasutamine

`high_up_range` ja `low_down_range` ennikud informeerivad positsiooni suurust. Kui ennustatud suund on "up" ja üles vahemik eksisteerib, saab vahemiku alumise ja ülemise piiri põhjal arvutada oodatava liikumise keskmisena ning kasutada seda positsiooni suuruse määramisel proportsionaalselt volatiilsuse sihtmärgiga.

### 10.3 Usaldusväärsuse kalibreerimine

Empiiriline valideerimine peaks kinnitama, et väidetud usaldusväärsus ühtib realiseeritud täpsusega:
- Kui 75% usaldusväärsusega ennustused on õiged 75% ajast, on kalibreerimine hea
- Süstemaatiline üle/ala-usaldusväärsus nõuab täpsusmõõdikute ümberkalibreerimist

## 11. Kokkuvõte

Käesolev peatükk on tutvustanud täielikku reaalajas ennustussüsteemi hinnamuutuste reaalajas prognoosimiseks, käsitledes insenertehnilisi väljakutseid, mis eristavad tootmisjuurutamist võrguühenduseta treenimisest. Arhitektuur demonstreerib mitmeid olulisi disainimustreid:

1. **Kaheallikaline sünkroniseerimine**: Ootel sõnastikud koordineerivad asünkroonsete tehingute ja orderiraamatute saabumisi, tagades, et ennustused kasutavad joondatud tunnuseid

2. **Piiratud voogedastuspuhvrid**: Fikseeritud suurusega DataFrame'i salvestus sabapõhise kärpimisega säilitab mälupiirangud pideva töö ajal

3. **Täpsusele optimeeritud ansamblid**: Eraldi spetsialistide grupid negatiivse ja positiivse täpsuse jaoks võimaldavad riskiteadlikku ennustuse tõlgendamist

4. **Häälte enamus kalibreeritud usaldusväärsusega**: Täpsuskaalutud agregeerimine toodab usaldusväärsuse hinnanguid, mis kajastavad empiirilist usaldusväärsust

5. **Lävendi-suuna süntees**: Mitu binaarset klassifikatsiooni kombineeritakse tegutsetavateks suunasignaalideks koos suurusvahemikega

6. **Tüübikindlad väljundstruktuurid**: Andmeklassipõhised ennustused literaaltüüpidega võimaldavad kompileerimisaegset allavoolu tarbijate verifitseerimist

Süsteem saavutab alla 100ms ennustuslatentsuse ~70MB mälujäljega sümboli kohta, võimaldades reaalajas juurutamist algoritmilise kauplemise rakendustes. Modulaarne arhitektuur toetab iga komponendi sõltumatut optimeerimist, säilitades samal ajal puhtad liidesed testimiseks ja monitoorimiseks.

Tulevased täiustused võivad hõlmata võrgupõhist mudeli uuendamist režiimimuutustega kohanemiseks, mitme sümboli korrelatsioonimodelleerimist ning integratsiooni täitmissüsteemidega suletud ahela kauplemise automatiseerimiseks. Voogedastusarhitektuur pakub aluse nendeks laiendusteks, säilitades samal ajal ajalise tervikluse ja täpsusele kalibreeritud usaldusväärsuse hindamise põhiprintsiibid.


