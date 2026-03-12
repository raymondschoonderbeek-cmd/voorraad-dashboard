# Tikkie integratie – vaste betaallink

## Aanpak

De app gebruikt een **vaste Tikkie betaallink** die de beheerder kan instellen. Geen API, geen kosten.

### Flow

1. Gebruiker bestelt broodjes
2. Na bestelling: "Betaal nu" opent de geconfigureerde Tikkie-link in een nieuw tabblad
3. Gebruiker betaalt via [tikkie.me](https://tikkie.me) met iDEAL
4. Beheerder ziet bestellingen in Lunch beheer → Dagoverzicht en kan handmatig als betaald markeren

### Instelling

- **Lunch beheer** → tab **Instellingen** → veld "Tikkie betaallink"
- Voorbeeld: `https://tikkie.me/pay/vik0pk301it50ijl1l67`
- Alleen beheerders kunnen de link aanpassen
