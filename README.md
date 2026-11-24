# FuelTrip

Aplikacja do planowania kosztów przejazdu – **policz, ile kosztuje Twoja trasa**.

Wyszukaj trasę „skąd → dokąd”, zobacz ją na mapie i od razu poznaj dystans oraz koszt paliwa – dla jednej lub kilku tras.

🔗 **Wersja online:** https://novaflowdesign.github.io/fueltrip/

> Status: etap 4 – trasa „Skąd → Dokąd” na mapie, dystans i czas, opcja „Tam i z powrotem” oraz koszt paliwa (spalanie, cena, rodzaj paliwa). Wiele tras naraz w przygotowaniu.

## Stack

- [Vite](https://vite.dev/) + TypeScript (vanilla, bez frameworka), testy: [Vitest](https://vitest.dev/)
- [MapLibre GL JS](https://maplibre.org/) – wektorowa mapa
- [OpenFreeMap](https://openfreemap.org/) – darmowe kafelki mapy (bez klucza API)
- [Photon](https://photon.komoot.io/) – podpowiedzi adresów (geokodowanie)
- [OSRM](https://project-osrm.org/) – wyznaczanie tras samochodowych (serwer demonstracyjny, bez gwarancji dostępności)
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
  map/map.ts             # inicjalizacja MapLibre
  map/markers.ts         # markery startu/celu + kadrowanie mapy
  map/routeLayer.ts      # linia trasy + animacja rysowania
  services/geocoding.ts  # Photon – wyszukiwanie miejsc
  services/routing.ts    # RoutingProvider + OSRM
  ui/autocomplete.ts     # pole z podpowiedziami (klawiatura, ARIA)
  ui/routeSearch.ts      # pola „Skąd” / „Dokąd” + zamiana ⇅
  ui/routeSummary.ts     # karta z dystansem, czasem i „Tam i z powrotem”
  ui/fuelSettings.ts     # spalanie, cena, rodzaj paliwa
  ui/costSummary.ts      # karta „Koszt przejazdu”
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
- Pola liczbowe przyjmują przecinek i kropkę (`7,5` lub `7.5`).
