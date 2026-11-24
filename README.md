# FuelTrip

Aplikacja do planowania kosztów przejazdu – **policz, ile kosztuje Twoja trasa**.

Wyszukaj trasę „skąd → dokąd”, zobacz ją na mapie i od razu poznaj dystans oraz koszt paliwa – dla jednej lub kilku tras.

🔗 **Wersja online:** https://novaflowdesign.github.io/fueltrip/

> Status: wszystkie etapy z planu gotowe – wiele tras z przystankami, profile aut z cenami paliw, „Tam i z powrotem”, podział kosztu na osoby, zapamiętywanie w przeglądarce, jasny/ciemny motyw, animacje i wersja mobilna.

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
  ui/routeSearch.ts      # „Skąd” / przystanki / „Dokąd” + odwracanie ⇅
  ui/routeCard.ts        # karta trasy: nazwa, zwijanie, usuwanie, wybór auta, koszt
  ui/routeSummary.ts     # dystans, czas i „Tam i z powrotem” w karcie
  ui/fuelSettings.ts     # „Auta i paliwo”: profile aut i ceny paliw w użyciu
  ui/tripsSummary.ts     # podsumowanie wszystkich tras + podział na osoby
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
- Każda trasa jedzie wybranym autem z sekcji „Auta i paliwo” (spalanie + rodzaj paliwa) albo z „własnym spalaniem” wpisanym tylko dla tej trasy.
- Koszt trasy liczony jest ceną paliwa jej auta. Ceny podaje się tylko dla paliw, których używają auta na trasach.
- Przystanki pośrednie (do 5 na trasę) – trasa jest wyznaczana przez wszystkie punkty w podanej kolejności.
- Podział na osoby: kwota na osobę zaokrąglana w górę do grosza, żeby wpłaty pokryły cały koszt.
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
