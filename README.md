# FuelTrip

Aplikacja do planowania kosztów przejazdu – **policz, ile kosztuje Twoja trasa**.

Wyszukaj trasę „skąd → dokąd”, zobacz ją na mapie i od razu poznaj dystans oraz koszt paliwa – dla jednej lub kilku tras.

🔗 **Wersja online:** https://novaflowdesign.github.io/fueltrip/

> Status: etap 2 – wyszukiwarka „Skąd → Dokąd” z podpowiedziami adresów i markerami na mapie. Wyznaczanie trasy i kalkulator kosztów w przygotowaniu.

## Stack

- [Vite](https://vite.dev/) + TypeScript (vanilla, bez frameworka)
- [MapLibre GL JS](https://maplibre.org/) – wektorowa mapa
- [OpenFreeMap](https://openfreemap.org/) – darmowe kafelki mapy (bez klucza API)
- [Photon](https://photon.komoot.io/) – podpowiedzi adresów (geokodowanie)
- Hosting: GitHub Pages (deploy przez GitHub Actions)

Aplikacja jest w pełni statyczna – nie ma backendu ani kluczy API w repozytorium.

## Uruchomienie lokalne

Wymagany Node.js 22+.

```bash
npm install
npm run dev       # serwer deweloperski
npm run build     # sprawdzenie typów + build produkcyjny do dist/
npm run preview   # podgląd buildu pod http://localhost:4173/fueltrip/
```

## Deploy

Każdy push na gałąź `main` uruchamia workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), który buduje aplikację i publikuje ją na GitHub Pages.

Jednorazowa konfiguracja: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Struktura

```
src/
  main.ts                # start aplikacji
  map/map.ts             # inicjalizacja MapLibre
  map/markers.ts         # markery startu/celu + kadrowanie mapy
  services/geocoding.ts  # Photon – wyszukiwanie miejsc
  ui/autocomplete.ts     # pole z podpowiedziami (klawiatura, ARIA)
  ui/routeSearch.ts      # pola „Skąd” / „Dokąd” + zamiana ⇅
  utils/debounce.ts
  style.css              # style + zmienne kolorów (jasny/ciemny motyw)
```

Pełna specyfikacja projektu: [CLAUDE.md](CLAUDE.md).

## Atrybucja

Dane mapy © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, kafelki [OpenFreeMap](https://openfreemap.org/), geokodowanie [Photon](https://photon.komoot.io/) (komoot).
