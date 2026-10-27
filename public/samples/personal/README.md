# Sample personal data

For testing the data intake and the day replay. Rebuild with `python3 scripts/personal/make-samples.py`
(needs `pip install rdata`) and `node scripts/personal/render-report.cjs`.

| File | What it is | Real or made up |
|---|---|---|
| `sam-dexcom.csv` | Dexcom G4 readings every 5 min for 6 days, written as a Dexcom Clarity export | **Real**: subject 2133-018 of Hall et al. (2018) |
| `hall-2133-039-libre.csv` | The same study's subject 2133-039, written as a LibreView export (mmol/L, day-first dates, every 15 min) | **Real** values, Libre layout made up |
| `hall-meals.json` | Times of three standardised breakfasts per subject (cornflakes and milk, peanut butter sandwich, protein bar) | **Real** |
| `sam-apple-health.xml` | A week of Apple Watch heart rate, HRV, steps, sleep stages and walks for the same days | Made up |
| `sam-blood-test.pdf` / `.png` | A lab report that fits a person with type 2 diabetes and mild fatty liver | Made up ("Sample Community Laboratory") |

"Sam" is a sample person who borrows the glucose trace of subject 2133-018; nothing else about Sam is real.

Source of the real data: Hall H, Perelman D, Breschi A, et al. *Glucotypes reveal new patterns of glucose
dysregulation.* PLOS Biology 16(7): e2005143 (2018), doi:10.1371/journal.pbio.2005143, CC BY 4.0; taken from
the iglu R package (github.com/irinagain/iglu, `data/example_data_hall.rda`, `example_meals_hall.rda`).
Times are converted from UTC to US Pacific time (the study ran at Stanford).
