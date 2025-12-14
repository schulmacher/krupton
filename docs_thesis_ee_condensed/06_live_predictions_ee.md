# Reaalajas ennustussüsteem: voogedastuspõhine ansamblipõhine järeldamine

Käesolev peatükk tutvustab reaalajas ennustussüsteemi, mis muundab võrguühenduseta treenitud masinõppemudelid voogedastuspõhiseks järelduskonveieriks. Arhitektuur käsitleb tootmismasinõppe juurutamise väljakutseid: kaheallikaandmete sünkroniseerimine, mälupõhine tunnuspuhvri haldamine, mudelite ansambli orkestratsioon täpsusele optimeeritud spetsialistide valikuga ning lävipõhine suunaline süntees tegutsetavateks kauplemissignaalideks.

## Ekspertide segu (MoE) taustakirjandus

Ekspertide segu (Mixture of Experts, MoE) on masinõppe arhitektuur, mis kombineerib mitu spetsialiseeritud alammudelit (eksperdid) koos suunamismehhanismiga, mis määrab dünaamiliselt, milline ekspert peaks konkreetset sisendit töötlema [6].

**Hierarhiline ekspertide segu (HME)**: Jordan ja Jacobs tutvustasid 1993. aastal puustruktuuriga arhitektuuri, kus iga sisend suunatakse läbi otsustuspuude sobiva eksperdi juurde [7]. EM-algoritmi kasutamine võimaldab parameetrite efektiivset kohandamist. HME saavutas robotidünaamika ülesannetes võrreldava täpsuse tagasilevimusvõrkudega, kuid 150× kiiremini (35 vs 5500 epohhi).

**Hõreda valikuga MoE**: Shazeer jt pakkusid 2017. aastal välja suunamismehhanismi, mis aktiveerib iga sisendi jaoks ainult ekspertide alamhulga, suurendades oluliselt mudeli võimsust arvutusliku efektiivsuse säilitamisel [8].

**Kaasaegsed laiendused**: HyperMoE integreerib hüpervõrgud teadmiste ülekandmiseks ekspertide vahel [9]. Finantsvaldkonnas on MoE arhitektuure rakendatud hinnaennustamiseks, kus erinevad eksperdid spetsialiseeruvad erinevatele turutingimustele [10].

Käesoleva süsteemi arhitektuur järgib MoE põhimõtteid: spetsialistide grupid toimivad ekspertidena, täpsuspõhine valik toimib suunamismehhanismina ning häälteenamus agregeerib ekspertide väljundeid lõplikuks ennustuseks.

## Süsteeminõuded ja arhitektuur

Tootmisennustussüsteem rahuldab piiranguid:

1. **Ajaline joondamine**: Tehingu- ja orderiraamatu aknad sünkroniseeritud enne ennustamist
2. **Piiratud mälu**: Fikseeritud maksimaalse suurusega tunnuspuhvrid
3. **Madal latentsus**: Ennustused millisekundite jooksul pärast akna valmimist
4. **Graatsiline degradatsioon**: Puuduvad aknad ei põhjusta süsteemi tõrkeid
5. **Täpsuse kalibreerimine**: Usaldusväärsuse hinnangud kajastavad empiirilist täpsust
6. **Tõlgendatav väljund**: Binaarsed ennustused sünteesitud tegutsetavateks suunasignaalideks

```mermaid
flowchart LR
    A[Tunnuspuhver<br/>Voogedastus] --> B[Spetsialistide<br/>Grupid]
    B --> C[Ansambli<br/>Agregeerimine]
    C --> D[Ennustuste<br/>Kombineerija]
```

: Joonis 6.2 Reaalajas ennustussüsteemi arhitektuur

## Tunnuspuhvri haldamine

| Komponent    | Väli             | Tüüp              | Eesmärk                             |
| ------------ | ---------------- | ----------------- | ----------------------------------- |
| Metaandmed   | `platform`       | `str`             | Platvormi identifikaator            |
| Metaandmed   | `symbol`         | `str`             | Kauplemispaari sümbol               |
| Metaandmed   | `window_size_ms` | `int`             | Akna suurus millisekundites         |
| Valmis aknad | `df`             | `DataFrame`       | Joondatud tehingu + orderi tunnused |
| Ootel tehing | `pending_trade`  | `dict[int, dict]` | Ootab orderi vastaspoolt            |
| Ootel order  | `pending_order`  | `dict[int, dict]` | Ootab tehingu vastaspoolt           |

: Tabel 6.2 Tunnuspuhvri komponendid

**Kaheallikaline sünkroniseerimine**: Tehingu ja orderiraamatu tunnusvood pärinevad sõltumatutelt töötajatelt. Mõlema allika andmete saabumine käivitab valmimise kontrolli: kui mõlemad tunnuste komplektid on saabunud, kombineeritakse need üheks reaks ja lisatakse DataFrame'i.

**Mälupiirangu jõustamine**: Puhver jõustab maksimaalse suuruse 5000 akent. 30-sekundiliste akende puhul esindab see ~42 tunni andmeid. Ootel sõnastikest eemaldatakse aknad, mis on vanemad kui 10× akna suurus (5 minutit 30-sekundiliste akende puhul). 10× koefitsient on valitud pragmaatiliselt, aktsepteerides andmekadu piiratud mälu vastu.

**Soekäivitus**: Puhvri saab initsialiseerida ajaloolistest Parquet andmetest, võimaldades ennustussüsteemil alustada kohe käivitumisel ilma puhvri kogunemist ootamata.

## Spetsialistide ansambli arhitektuur

| Väli                     | Tüüp                     | Eesmärk                     |
| ------------------------ | ------------------------ | --------------------------- |
| `ml_tree_result_id`      | `int`                    | Treenimistulemuse viide     |
| `clf`                    | `DecisionTreeClassifier` | Treenitud otsustuspuu mudel |
| `used_features`          | `list[str]`              | Mudeli tunnusgrupid         |
| `used_features_lookback` | `int`                    | Tagasivaate sügavus         |
| `transformation`         | `str`                    | Teisenduse strateegia       |
| `precision_neg`          | `float`                  | Negatiivse klassi täpsus    |
| `precision_pos`          | `float`                  | Positiivse klassi täpsus    |

: Tabel 6.3 Spetsialisti andmestruktuur

| Väli              | Tüüp               | Eesmärk                                   |
| ----------------- | ------------------ | ----------------------------------------- |
| `target_name`     | `str`              | Sihtmärgi identifikaator                  |
| `neg_specialists` | `list[Specialist]` | Top-K spetsialistid `precision_neg` järgi |
| `pos_specialists` | `list[Specialist]` | Top-K spetsialistid `precision_pos` järgi |

: Tabel 6.4 Spetsialistide grupi struktuur

**Kahekordne täpsuse optimeerimine**: Kõrge negatiivne täpsus tagab usaldusväärse "lävendi ületamist ei toimu" ennustuse, kõrge positiivne täpsus tagab usaldusväärse "lävendi ületamine toimub" ennustuse. Tüüpiliselt K=3, kusjuures sama mudel võib ilmuda mõlemas loendis.

**Andmebaasist laadimine**: Süsteem teeb kaks eraldi päringut PostgreSQL andmebaasi: esimene hangib top-K mudelid negatiivse täpsuse järgi, teine positiivse täpsuse järgi. Sama mudel võib ilmuda mõlemas loendis, kui see on silmapaistev mõlema mõõdiku osas - sellisel juhul mudel panustab mõlemasse ansambliprognoos.

**Mudeli deserialiseerimine**: Treenitud scikit-learn mudelid on salvestatud PostgreSQL-is joblib-serialiseeritud baitidena. Joblib deserialiseerimine rekonstrueerib täieliku otsustuspuu struktuuri, sealhulgas jaotuslävendid ja lehtede ennustused.

**Tunnusindeksi kaardistamine**: Tõhusa veeruvaliku võimaldamiseks ehitab süsteem eelnevalt indeksikaardi, mis võimaldab O(1) veergude indeksite otsingut mistahes tunnusgrupi jaoks.

## Üksiku spetsialisti ennustamine

| Samm                   | Sisend                        | Väljund                                    |
| ---------------------- | ----------------------------- | ------------------------------------------ |
| Tunnuste eraldamine    | Tunnusgrupi nimed             | Valikuline maatriksi slice                 |
| Teisenduse rakendamine | Treeningkontekst + testandmed | Z-skoor või Fibonacci-astmelised väärtused |
| Ennustus               | Teisendatud tunnused          | Binaarne täisarv (0 või 1)                 |

**Tunnusveergude eraldamine**: Iga spetsialisti kasutatud tunnusgrupi nime jaoks leitakse indeksikaardist vastav veergude indeksite loend. Kui spetsialist kasutab tunnuseid `["t_sum_vol", "o_sw_imb"]` tagasivaatega 12, eraldab see 26 veergu (13 ajalist nihet × 2 tunnusgruppi).

**Teisenduse rakendamine**: Z-skoori normaliseerimise puhul arvutatakse puhvrist keskmine ja standardhälve, seejärel normaliseeritakse viimane vaatlus niiviisi, et andmed oleksid täpselt samas formaadis nagu olid treening andmed. Fibonacci-viivitusega astmeliste puhul luuakse momentumindikaatoreid üle ajalise dimensiooni, võrreldes praeguseid väärtusi mineviku väärtustega Fibonacci-järjestuse viidete põhjal (2, 3, 5, 8, 13 aknaid tagasi), nagu kirjeldatud peatükis 5.5. Teisenduse strateegia (`none`, `zscore`, `stepper_fibo`, `zscore_stepper_fibo`) määratakse treeningu ajal vastavalt tabelis 5.3 kirjeldatud strateegia valikule.

## Häälteenamuse agregeerimine

**Häälte lugemine**: Iga spetsialistide grupi kohta loendatakse, mitu spetsialisti ennustab klassi 0 ja mitu klassi 1. Võrdsete häälte korral vaikimisi klass 0 (konservatiivne kallutus).

**Täpsuskaalutud usaldusväärsus**: Usaldusväärsus = nõustuvate spetsialistide täpsuste keskmine. Kui kolm spetsialisti täpsustega 0.8, 0.9, 0.7 ennustavad klassi 1, on usaldusväärsus 0.8.

**Kahekordse ansambli väljund**: Iga sihtmärgi kohta genereerivad nii negatiivne kui positiivne ansambel sõltumatud ennustused, võimaldades riskiteadlikku tõlgendamist.

## Lävipõhine suunaline süntees

**Sihtmärgi nime parsimine**: Formaat target_{price_type}_{direction}_{threshold}p → target_high_up_0.09p.

**Vahemiku tuletamine**: Filtreeri asjakohased ennustused → sorteeri läve järgi → leia esimene/viimane positiivne lävi (nõustumine ≥50%, filtreerides madala usaldusväärsusega signaalid) → vahemiku piirid.

| Üles vahemik | Alla vahemik | Suund      | Tõlgendus                           |
| ------------ | ------------ | ---------- | ----------------------------------- |
| Olemas       | Puudub       | "up"       | Tõusev liikumine                    |
| Puudub       | Olemas       | "down"     | Langev liikumine                    |
| Olemas       | Olemas       | "volatile" | Suur liikumine, suund ebakindel     |
| Puudub       | Puudub       | "stable"   | Märkimisväärset liikumist ei oodata |

: Tabel 6.5 Suunalise klassifitseerimise loogika

| Suund    | Usaldusväärsuse arvutus                                  |
| -------- | -------------------------------------------------------- |
| Stable   | Keskmine negatiivne nõustumine                           |
| Volatile | Fikseeritud 0.5 (fundamentaalne ebakindlus suuna osas)   |
| Up/Down  | Keskmine positiivne usaldusväärsus suuna järgi           |

: Tabel 6.6 Usaldusväärsuse hindamine suuna järgi

## Reaalajas ennustamise orkestratsioon

**Voogedastuse uuendused**: Andmed saabuvad tagasikutsemeetodite kaudu eraldi tehingu ja orderi akende jaoks. Tagastusväärtus näitab akna valmimist, võimaldades ülesvoolu koodil käivitada ennustusi ainult siis, kui uued andmed on saadaval.

Põhiline ennustusmeetod:

1. Piisavuse kontroll (puhvri suurus ≥ tagasivaate sügavus + 1)
2. Puhvri lõikamine (viimased N akent, kus N ≤ maksimaalse treeningu andmete pikkusega, vaikimisi 2000, pakkudes piisavat konteksti transformatsioonidele)
3. Ajaline joondamine (k-nihke liitmised luues tagasivaateveerud)
4. NumPy massiiviks lamendamine
5. Ennustuste genereerimine iga sihtmärgi jaoks
6. Kokkuvõtte kombineerimine

**Ennustushorisont**: Ennustuse aeg arvutatakse akna lõpuajast liites juurde kolmekordse akna suuruse (90 sekundit 30-sekundiliste akende puhul), mis vastab treeningu sihtmärgi horisondile (lõdvendatud sobitamine üle akende 1-3).

## Ennustuse väljundformaat

| Väli                  | Tüüp       | Eesmärk                          |
| --------------------- | ---------- | -------------------------------- |
| `prediction_for_timestamp` | `datetime` | Ennustuse sihtaeg           |
| `target_name`         | `str`      | Sihtmärgi identifikaator         |
| `neg_prediction`      | `int`      | Negatiivse ansambli ennustus     |
| `neg_confidence`      | `float`    | Negatiivse ansambli usaldusväärsus |
| `neg_model_agreement` | `float`    | Negatiivse ansambli nõustumine   |
| `pos_prediction`      | `int`      | Positiivse ansambli ennustus     |
| `pos_confidence`      | `float`    | Positiivse ansambli usaldusväärsus |
| `pos_model_agreement` | `float`    | Positiivse ansambli nõustumine   |

: Tabel 6.7 Sihtmärgi ennustuse struktuur (`TargetPrediction`)

| Väli               | Tüüp                              | Eesmärk                      |
| ------------------ | --------------------------------- | ---------------------------- |
| `prediction_for_timestamp` | `datetime`                | Ennustuse sihtaeg            |
| `predictions`      | `dict[str, TargetPrediction]`     | Kõik sihtmärgi ennustused    |
| `high_up_range`    | `tuple[float, float] \| None`     | Kõrgpunkti tõusu vahemik     |
| `high_down_range`  | `tuple[float, float] \| None`     | Kõrgpunkti languse vahemik   |
| `high_direction`   | `Literal["up","down","volatile","stable"]` | Kõrgpunkti suund  |
| `high_confidence`  | `float`                           | Kõrgpunkti usaldusväärsus    |
| `low_up_range`     | `tuple[float, float] \| None`     | Madalpunkti tõusu vahemik    |
| `low_down_range`   | `tuple[float, float] \| None`     | Madalpunkti languse vahemik  |
| `low_direction`    | `Literal["up","down","volatile","stable"]` | Madalpunkti suund |
| `low_confidence`   | `float`                           | Madalpunkti usaldusväärsus   |

: Tabel 6.8 Ennustuse kokkuvõtte struktuur (`PredictionSummary`)

**Näidisväljund**: "Kõrgpunkt tõenäoliselt tõuseb 0.05-0.14% 78% usaldusväärsusega."

## Integratsioon kauplemissüsteemidega

| Suund      | Usaldusväärsus | Tegevus                            |
| ---------- | -------------- | ---------------------------------- |
| "up"       | > 0.7          | Kaaluda pikka positsiooni          |
| "down"     | > 0.7          | Kaaluda lühikest positsiooni       |
| "stable"   | > 0.6          | Hoida või vähendada ekspositsiooni |
| "volatile" | ükskõik        | Suurendada ettevaatlikkust         |

: Tabel 6.10 Ennustuste tõlgendamine kauplemissignaalideks

Usaldusväärsuse lävid on empiirilistel heuristilistel vaatlustel põhinevad soovitused, mis nõuavad valideerimist konkreetses kauplemiskontekstis.

**Vahemiku kasutamine**: Väljundis olevad `high_up_range` ja `low_down_range` näidikud informeerivad positsiooni suurust. Kui ennustatud suund on "up" ja üles vahemik eksisteerib, saab vahemiku alumise ja ülemise piiri põhjal arvutada oodatava liikumise keskmisena ning kasutada seda positsiooni suuruse määramisel proportsionaalselt volatiilsuse sihtmärgiga.

**Usaldusväärsuse kalibreerimine**: 75% usaldusväärsusega ennustused peaksid olema õiged 75% ajast. Süstemaatiline üle- või ala-usaldusväärsus nõuab täpsusmõõdikute ümberkalibreerimist.

**Tulevikutöö**: Käesoleva töö raames pole ennustuste väljundeid integreeritud tegeliku kauplemissüsteemiga ega testitud reaalajas turutingimustes. Tulevikus tuleks valideerida ennustuste kasumlikkust backtest-simulatsioonidega, hinnata tehingukulude mõju, optimeerida positsiooni suuruse määramise strateegiaid ning testida süsteemi robustsust erinevatel turutingimustel ja volatiilsuse perioodidel.

## Kokkuvõte

Peatükk esitas reaalajas ennustussüsteemi, mis muundab võrguühenduseta treenitud otsustuspuud voogedastuspõhiseks järelduskonveieriks. Arhitektuur lahendab tootmismasinõppe juurutamise väljakutseid läbi kolme põhimehhanismi:

**Kaheallikaline sünkroniseerimine** kasutab ootel sõnastikke tehingute ja orderiraamatu akende koordineerimiseks, tagades ajalise joonduse hoolimata asünkroonsest saabumisest. Tunnuspuhver haldab fikseeritud suurusega mälu libiseva akna kaudu, võimaldades pidevat töötlemist ilma mälu ammendumiseta.

**Ekspertide segu inspireeritud ansambliarhitektuur** kombineerib täpsusele spetsialiseeritud mudeligruppe. Igal sihtmärgil on kaks spetsialistide komplekti: negatiivse täpsuse eksperdid vähendavad valepositiivseid, positiivse täpsuse eksperdid maksimeerivad sihtmärgi avastamist. Häälteenamuse agregeerimine koos täpsuskaalutud usaldusväärsusega toodab kalibreeritud usaldusväärsuse hinnanguid, mis kajastavad empiirilist täpsust.

**Lävipõhine suunaline süntees** kombineerib mitu binaarset klassifikatsiooni tegutsetavateks hinnamuutuste signaalideks. Süsteem parsib läve ületamise ennustused vahemikeks ja suundadeks ("up", "down", "volatile", "stable"), võimaldades otsest integratsiooni kauplemissüsteemidega ilma täiendava tõlgenduseta.

Süsteem järgib MoE põhimõtteid: spetsialistide grupid toimivad ekspertidena, täpsuspõhine valik toimib suunamismehhanismina ning häälteenamus agregeerib ekspertide väljundeid robustseks lõplikuks ennustuseks.
    