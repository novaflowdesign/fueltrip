# FuelTrip – specyfikacja projektu

## Nazwa
- Nazwa aplikacji: **FuelTrip** (używaj jej w `<title>`, nagłówku, manifeście i README).
- Repozytorium: `fueltrip` → adres: `https://<login>.github.io/fueltrip/`.
- Podtytuł w UI (po polsku), np. „Policz, ile kosztuje Twoja trasa”.

## Cel
Statyczna aplikacja webowa hostowana na **GitHub Pages**, która liczy koszt paliwa dla jednej lub kilku tras.
Użytkownik wyszukuje trasę „od → do” jak w Google Maps, aplikacja pokazuje ją na animowanej mapie, podaje dystans i liczy koszt paliwa.

Język interfejsu: **polski**. Identyfikatory w kodzie i komentarze: angielski.

## Wymagania funkcjonalne

### 1. Wyszukiwarka trasy (jak w Google Maps)
- Dwa pola: **Skąd** i **Dokąd**, z podpowiedziami adresów podczas pisania (autocomplete, debounce ~300 ms, min. 3 znaki).
- Przycisk ⇅ zamieniający „skąd” i „dokąd” miejscami.
- Po wybraniu obu punktów aplikacja automatycznie wyznacza trasę samochodową i pokazuje:
  - dystans w km (1 miejsce po przecinku),
  - przybliżony czas przejazdu (np. „2 h 15 min”).
- Opcjonalnie (nice to have): punkty pośrednie („+ Dodaj przystanek”).

### 2. Tam i z powrotem
- Checkbox **„Tam i z powrotem”** przy każdej trasie.
- Zaznaczony = dystans × 2 (zakładamy tę samą drogę powrotną, bez osobnego zapytania o trasę).
- Wyświetlaj czytelnie np. `245,3 km × 2 = 490,6 km`.

### 3. Wiele tras + nazywanie
- Użytkownik może dodać wiele tras do jednego obliczenia (lista/karty tras).
- Każda trasa ma **edytowalną nazwę** (domyślnie „Trasa 1”, „Trasa 2”…; np. „Ślub – Gliwice → Kraków”).
- Każdą trasę można: edytować, usunąć, zwinąć/rozwinąć, pokazać/podświetlić na mapie.
- Każda trasa na mapie ma **własny kolor**; kliknięcie karty podświetla jej trasę i przybliża do niej mapę.
- Podsumowanie na dole: **suma km wszystkich tras** i **łączny koszt paliwa** + rozbicie per trasa.

### 4. Obliczenie kosztu
- Ustawienia globalne:
  - spalanie [l/100 km] (np. 7,5),
  - cena paliwa [zł/l] – wpisywana ręcznie,
  - rodzaj paliwa (Pb95 / ON / LPG) – tylko jako etykieta.
- Możliwość nadpisania spalania dla konkretnej trasy (np. inne auto). Opcjonalnie: zapisane **profile aut** (nazwa + spalanie + paliwo) do wyboru z listy.
- Wzór: `koszt = km_łącznie × spalanie / 100 × cena`.
- Wyświetlaj też zużyte litry paliwa.
- Opcjonalnie: podział kosztu na N osób.
- Formatowanie po polsku: `Intl.NumberFormat('pl-PL')`, kwoty `1 234,56 zł`.
- Pola liczbowe mają przyjmować zarówno przecinek, jak i kropkę.

### 5. Zapamiętywanie
- Trasy, ustawienia i profile aut zapisywane w `localStorage` (odczyt/zapis w `try/catch`, wersjonowany klucz, np. `fueltrip:v1`).
- Przycisk „Wyczyść wszystko” (z potwierdzeniem w UI, nie przez `confirm()`).

## Mapa i animacje („fajna mapa”)
- Biblioteka: **MapLibre GL JS** (płynne wektorowe mapy, lepsze animacje niż Leaflet).
- Kafelki: **OpenFreeMap** (darmowe, bez klucza), styl np. `https://tiles.openfreemap.org/styles/liberty`. Rozważ ciemny wariant / przełącznik jasny–ciemny.
- Animacje:
  - po wyznaczeniu trasy: `fitBounds` z płynnym przelotem (`flyTo`/`easeTo`, ~1,5 s),
  - **rysowanie trasy „na żywo”** – linia dorysowuje się od startu do celu (animacja `line-gradient`/`line-progress` lub stopniowe dokładanie współrzędnych w `requestAnimationFrame`),
  - markery startu i celu z animacją pojawienia się (drop/pulse),
  - podświetlenie trasy po najechaniu/kliknięciu karty (grubsza linia, reszta przygaszona),
  - animowane liczniki km i kosztu (count-up przy zmianie wartości).
- Szanuj `prefers-reduced-motion` – wtedy bez animacji.
- Atrybucja OpenStreetMap/OpenFreeMap musi być widoczna na mapie.

## Zewnętrzne API (wszystko z przeglądarki, bez backendu)
- **Geokodowanie / autocomplete: Photon** – `https://photon.komoot.io/api/?q=<tekst>&limit=5`
  (opcjonalnie `lat`/`lon` do priorytetu wyników w pobliżu, `bbox` / filtrowanie po kraju).
  Uwaga: NIE używać publicznego Nominatim do autocomplete – jego zasady użycia tego zabraniają.
- **Routing: OSRM** – `https://router.project-osrm.org/route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=full&geometries=geojson`
  (zwraca `distance` w metrach i `duration` w sekundach). To serwer demonstracyjny bez gwarancji dostępności.
- Routing zrób za interfejsem (np. `RoutingProvider`), żeby łatwo podmienić OSRM na **OpenRouteService** (darmowy klucz) w razie problemów.
- Obsługa błędów: brak wyników, timeout, brak trasy → czytelny komunikat w UI, bez wywalania aplikacji. Anuluj nieaktualne zapytania (`AbortController`).

## Stack
- **Vite + TypeScript** (vanilla, bez frameworka – chyba że komponentów zrobi się dużo; wtedy dopuszczalny lekki framework po uzgodnieniu).
- `maplibre-gl` z npm.
- Style: zwykły CSS z custom properties (zmienne kolorów, tryb jasny/ciemny).
- Brak backendu, brak kluczy API w repo.

## Layout / UX
- Desktop: panel boczny po lewej (wyszukiwarka, lista tras, ustawienia, podsumowanie), mapa na resztę ekranu.
- Mobile: mapa na górze/pełny ekran + wysuwany panel od dołu (bottom sheet) z listą tras i podsumowaniem.
- Nowoczesny wygląd: zaokrąglone karty, cienie, płynne przejścia, wyraźna typografia. Unikać „szablonowego” wyglądu.
- Dostępność: etykiety pól, obsługa klawiatury w autocomplete (strzałki, Enter, Esc).

## Struktura (propozycja)
```
src/
  main.ts            # start aplikacji
  map/               # inicjalizacja MapLibre, warstwy tras, animacje
  services/
    geocoding.ts     # Photon
    routing.ts       # RoutingProvider + OSRM (+ ORS później)
  state/store.ts     # stan aplikacji + localStorage
  ui/                # wyszukiwarka, karty tras, ustawienia, podsumowanie
  utils/format.ts    # formatowanie liczb, czasu, parsowanie przecinka
  calc.ts            # czysta logika obliczeń
```
- Logika obliczeń (`calc.ts`) jako czyste funkcje + testy jednostkowe (Vitest).

## Deploy na GitHub Pages
- W `vite.config.ts` ustaw `base: '/fueltrip/'`.
- Workflow GitHub Actions (`.github/workflows/deploy.yml`): `npm ci` → `npm run build` → `actions/upload-pages-artifact` (`dist/`) → `actions/deploy-pages`.
- W ustawieniach repo: Settings → Pages → Source: **GitHub Actions**.

## Kolejność prac
1. Szkielet Vite + TS, mapa MapLibre z OpenFreeMap, deploy na Pages (żeby od razu działało online).
2. Wyszukiwarka z autocomplete (Photon) dla jednej trasy.
3. Routing OSRM + rysowanie trasy + dystans i czas.
4. Obliczenie kosztu + ustawienia + checkbox „tam i z powrotem”.
5. Wiele tras, nazywanie, kolory, podsumowanie.
6. localStorage.
7. Animacje i dopracowanie wyglądu, wersja mobilna.
8. Opcje dodatkowe: profile aut, przystanki, podział na osoby.

## Zasady pracy
- Przed większą zmianą krótko wyjaśnij plan i powód decyzji, potem implementuj.
- Po każdym etapie: zbuduj projekt (`npm run build`) i upewnij się, że nie ma błędów TS.
- Commituj małymi krokami z opisowymi wiadomościami.
