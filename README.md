# Pasianssi

Yksinkertainen Klondike-pasianssi selaimeen. Toimii puhelimessa sovelluksena (PWA): sen voi lisätä
aloitusnäytölle ja pelata myös ilman verkkoyhteyttä.

## Pelaaminen

- Siirrä kortteja **vetämällä** tai **napauttamalla**. Napautus siirtää kortin parhaaseen sallittuun
  paikkaan, ensisijaisesti pohjapinoon.
- Napauta pakkaa nostaaksesi kortteja. Kun pakka loppuu, napauta tyhjää paikkaa (↻), niin
  poistopino kääntyy takaisin pakaksi.
- **Uusi peli**: valitse, nostetaanko 1 vai 3 korttia kerrallaan.
- **Kumoa** peruu edellisen siirron.
- Kun kaikki kortit ovat näkyvissä ja pakka on tyhjä, peli siirtää loput kortit itse pohjapinoihin.
- Peli tallentuu automaattisesti, ja kesken jäänyt peli jatkuu, kun sovelluksen avaa uudelleen.
  Voitot ja paras aika tallentuvat laitteelle.
- Näppäimistöllä: välilyönti nostaa pakasta, `U` tai `Ctrl+Z` kumoaa, `N` aloittaa uuden pelin.

## Käyttöönotto

Pelkkiä staattisia tiedostoja: ei riippuvuuksia eikä käännösvaihetta.

Paikallisesti:

```
python3 -m http.server 8000
```

ja avaa <http://localhost:8000/>.

Puhelimeen asentaminen ja offline-tila vaativat **HTTPS**-osoitteen (service worker toimii vain HTTPS:n
tai `localhost`:n kautta). Pelkän lähiverkon `http://`-osoitteen kautta peli toimii selaimessa, mutta ei
ilman verkkoyhteyttä.

Helpoin julkaisutapa on GitHub Pages: **Settings → Pages → Build and deployment → Deploy from a branch**,
valitse haara ja kansio `/ (root)`. Yksityisessä repossa Pages vaatii maksullisen GitHub-tilin.

Asennus puhelimeen:

- **Android (Chrome)**: valikko ⋮ → *Asenna sovellus* tai *Lisää aloitusnäytölle*
- **iPhone (Safari)**: Jaa-painike → *Lisää Koti-valikkoon*

Avaa asennettu sovellus kerran **Koti-valikosta verkkoyhteyden ollessa päällä** ja pidä sitä auki
hetki. iPhonessa Koti-valikon sovelluksella on oma tallennustilansa erillään Safarista, joten
offline-tiedostot tallentuvat vasta tällä avauksella. *Uusi peli* -ikkunassa lukee
**✓ Toimii ilman verkkoa**, kun sovellus on valmis käytettäväksi ilman verkkoa.

## Päivittäminen

Asennettu sovellus avautuu heti välimuistista ja hakee uudet tiedostot taustalla, joten muutokset
näkyvät seuraavalla avauskerralla. Jos lisäät tai poistat tiedostoja, päivitä `FILES`-lista ja
`CACHE`-versio tiedostossa `sw.js`.

## Tiedostot

| Tiedosto | Sisältö |
|---|---|
| `index.html` | Sivu |
| `style.css` | Ulkoasu |
| `app.js` | Pelilogiikka, piirto, kosketus ja tallennus |
| `sw.js` | Offline-tuki (service worker) |
| `manifest.webmanifest`, `icons/` | Sovelluksen nimi, värit ja kuvakkeet |
| `wood.svg` | Puureunan syykuvio (piirretään selaimessa, ei kuvatiedostoa) |
