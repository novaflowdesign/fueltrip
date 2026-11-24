# FuelTrip

Aplikacja do planowania kosztów przejazdu – **policz, ile kosztuje Twoja trasa**.

Wyszukaj trasę „skąd → dokąd”, zobacz ją na mapie i od razu poznaj dystans oraz koszt paliwa – dla jednej lub kilku tras.

🔗 **Wersja online:** https://novaflowdesign.github.io/fueltrip/

> Status: etap 7 – wiele tras (nazwy, kolory, osobne spalanie), „Tam i z powrotem”, koszt paliwa, podsumowanie, zapamiętywanie w przeglądarce, jasny/ciemny motyw (także mapy), animacje i wersja mobilna z wysuwanym panelem. Dodatki (profile aut, przystanki, podział kosztu) w przygotowaniu.

## Stack

- [Vite](https://vite.dev/) + TypeScript (vanilla, bez frameworka), testy: [Vitest](https://vitest.dev/)
- [MapLibre GL JS](https://maplibre.org/) – wektorowa mapa
- [OpenFreeMap](https://openfreemap.org/) – darmowe kafelki mapy (bez klucza API)
- [Photon](https://photon.komoot.io/) – podpowiedzi adresów (geokodowanie)
- [OSRM](https://project-osrm.org/) – wyznaczanie tras samochodowych (serwer demonstracyjny, bez gwarancji dostępności)
- Krój pisma: [Manrope](https://fonts.google.com/specimen/Manrope) dołączony do aplikacji (pakiet `@fontsource-variable/manrope`, bez zapytań do Google Fonts)
- Hosting: GitHub Pages (deploy przez GitHub Actions)

Aplikacja jest w pełni statyczna – nie ma backendu ani kluczy API w repozytorium.

## Uruchomienie lokalne

Wymagany Node.js 22+.

```bash
npm install
npm run dev       # serwer deweloperski
npm test          # testy jednostkowe (Vitest)
npm run build     # sprawdzenie typów + build produkcyjny do dist/
npm run preview   # podgląd buildu pod http://localhost:4173/fueltrip/
```

## Deploy

Każdy push na gałąź `main` uruchamia workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), który uruchamia testy, buduje aplikację i publikuje ją na GitHub Pages. Jeśli testy nie przejdą, strona nie zostanie zaktualizowana.

Jednorazowa konfiguracja: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Struktura

```
src/
  main.ts                # start aplikacji
  calc.ts                # czysta logika obliczeń kosztu (+ calc.test.ts)
  state/store.ts         # stan aplikacji: trasy, ustawienia (+ store.test.ts)
  state/persistence.ts   # zapis/odczyt w localStorage (+ persistence.test.ts)
  map/map.ts             # inicjalizacja MapLibre
  map/markers.ts         # markery startu/celu + kadrowanie mapy
  map/routeLayer.ts      # linie tras (kolor per trasa), animacja, podświetlanie
  map/viewport.ts        # marginesy kadrowania (uwzględniają panel na telefonie)
  services/geocoding.ts  # Photon – wyszukiwanie miejsc
  services/routing.ts    # RoutingProvider + OSRM
  ui/autocomplete.ts     # pole z podpowiedziami (klawiatura, ARIA)
  ui/routeSearch.ts      # pola „Skąd” / „Dokąd” + zamiana ⇅
  ui/routeCard.ts        # karta trasy: nazwa, zwijanie, usuwanie, spalanie, koszt
  ui/routeSummary.ts     # dystans, czas i „Tam i z powrotem” w karcie
  ui/fuelSettings.ts     # globalne spalanie, cena, rodzaj paliwa
  ui/tripsSummary.ts     # podsumowanie wszystkich tras
  ui/toast.ts            # powiadomienie „Usunięto · Cofnij”
  ui/clearAll.ts         # „Wyczyść wszystko” z potwierdzeniem
  ui/theme.ts            # motyw Auto / Jasny / Ciemny
  ui/bottomSheet.ts      # wysuwany panel na telefonie
  ui/countUp.ts          # animowane liczniki
  utils/debounce.ts
  utils/format.ts        # formatowanie km, zł, litrów i czasu po polsku
  style.css              # style + zmienne kolorów (jasny/ciemny motyw)
```

Pełna specyfikacja projektu: [CLAUDE.md](CLAUDE.md).

## Atrybucja

Dane mapy © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, kafelki [OpenFreeMap](https://openfreemap.org/), geokodowanie [Photon](https://photon.komoot.io/) (komoot), trasy [OSRM](https://project-osrm.org/).

## Jak liczony jest koszt

```
koszt = km_łącznie × spalanie / 100 × cena
```

- „Tam i z powrotem” podwaja dystans (zakładamy tę samą drogę powrotną).
- Każda trasa może mieć własne spalanie (np. inne auto); puste pole = spalanie z sekcji „Paliwo”.
- Suma w podsumowaniu to suma kosztów poszczególnych tras (każdy zaokrąglony do grosza), więc rozbicie zawsze się zgadza.
- Pola liczbowe przyjmują przecinek i kropkę (`7,5` lub `7.5`).

## Dane w przeglądarce

Trasy i ustawienia są zapisywane wyłącznie lokalnie, w `localStorage` przeglądarki (klucz `fueltrip:v1`) – nic nie trafia na żaden serwer.
Wyznaczone trasy też są zapamiętywane, więc po odświeżeniu pojawiają się od razu, bez ponownego pytania serwera tras.
Przycisk „Wyczyść wszystko” na dole panelu usuwa wszystkie zapisane dane.

## Wygląd i dostępność

- Motyw **Auto / Jasny / Ciemny** (przełącznik w nagłówku) – zmienia też styl mapy; wybór jest zapamiętywany.
- Na telefonie mapa zajmuje cały ekran, a panel to wysuwany arkusz (zwinięty / połowa / pełny) – przeciągnij uchwyt, stuknij go albo użyj strzałek ↑/↓.
- Ustawienie systemowe „ogranicz ruch” wyłącza animacje (liczniki, rysowanie tras, przeloty mapy, przejścia).
- Stronę można dodać do ekranu głównego telefonu (manifest z nazwą i ikoną).
