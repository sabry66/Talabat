## Parity: 85.0 / 100

features 85.0  (62 counted, must-haves 29 of 30 done)

Not shippable yet: 1 must-have features are not done.

## By area, weakest first
- growth                         0.0  (2 features)
- checkout                      53.8  (7 features)
- tracking                      62.5  (5 features)
- platform                      76.9  (5 features)
- account                       78.6  (6 features)
- discovery                     88.1  (9 features)
- after order                   94.1  (7 features)
- menu                         100.0  (4 features)
- offers                       100.0  (3 features)
- cart                         100.0  (1 features)
- partners                     100.0  (9 features)
- admin                        100.0  (4 features)

## Missing, in build order
- [must] tracking: Push notifications when the app is closed, partial  (built (FCM + Cloud Function + SW); works while the app is open; closed-app push turns on after Blaze + VAPID key (SETUP.md))
- [should] account: Sign in with phone number + SMS code, no  (Arrivo uses email; SMS costs money)
- [should] checkout: Online card payment, no  (needs payment gateway (Paymob/Fawry) and fees)
- [should] checkout: Schedule an order for later, no
- [should] discovery: Only show restaurants that deliver to my area, no  (zones are platform-wide; restaurants not tied to zones)
- [should] platform: English language, no
- [should] tracking: Rider location live on a map, no
- [should] after order: Refunds handled through support, partial  (manual by admin; no refund record yet)
- [should] platform: iPhone app in the App Store, partial  (installable web app on iPhone; not in App Store)
- [should] tracking: Accurate ETA that updates, partial  (fixed time range per restaurant)
- [could] account: Sign in with Google or Apple, no
- [could] checkout: Save card for next time, no
- [could] checkout: Tip the rider, no
- [could] growth: Notifications about deals and new restaurants, no
- [could] growth: Referral / invite friends, no
- [could] discovery: Groceries and other shops, partial  (grocery category exists; no dedicated store flow)

## Left out on purpose (not scored)
- Thousands of partner restaurants: the restaurant network is theirs; Arrivo signs its own
- Dark stores / own grocery warehouses: needs warehouses and stock
- Paid Pro subscription: deliberately not: users complain it is unclear
- Wallet credit instead of refunds: deliberately not: users hate refunds as credit

## Yours, not in the original (not scored)
- InstaPay or wallet transfer on delivery (admin-controlled methods)
- Dark mode
- Human support reply promise
- Check order before paying + rider-confirmed refund
- No hidden fees promise + refund to the same payment method
- Restaurant packing checklist before ready
- No hidden service fee
