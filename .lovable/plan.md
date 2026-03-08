
## Plan : Refonte du visuel promotionnel Etsy

### Analyse des images de référence

D'après les images fournies, le design attendu est :
- **Image 1** : Logo du set en grand au centre, fond dégradé violet, texte "Placeholders + Checklist / Color & Grayscale" en bas, une seule grande page PDF visible avec effet d'ombre
- **Image 2** : 4 pages PDF en éventail (cascade) avec badges colorés, texte "Download, Print, Cut" en haut, drapeaux des langues, et bouton "Download" en bas

### Problèmes actuels
1. Les pages sont trop petites et mal positionnées
2. Le logo custom n'est pas assez mis en avant
3. L'effet de superposition/éventail n'est pas assez marqué
4. Le design général manque d'impact visuel

### Nouvelle mise en page proposée

**Structure du visuel (1080x1080)** :
```text
┌─────────────────────────────────────────┐
│  [LOGO DU SET - GRAND, CENTRÉ EN HAUT] │
│           (550x220px avec glow)         │
│                                         │
│    🇬🇧 🇫🇷 🇩🇪  (drapeaux centrés)       │
│                                         │
│   ┌─────┐                               │
│   │     │┌─────┐                        │
│   │ PDF ││     │┌─────┐                 │
│   │     ││ PDF ││     │┌─────┐          │
│   │     ││     ││ PDF ││     │          │
│   │     ││     ││     ││ PDF │          │
│   └─────┘│     ││     ││     │          │
│   Graded └─────┘│     ││     │          │
│          Complete└─────┘│     │          │
│                  Master └─────┘          │
│                         Grayscale        │
│                                         │
│  ═══════════════════════════════════════│
│  ✨ Instant Digital Download ✨         │
└─────────────────────────────────────────┘
```

### Modifications techniques

**`src/lib/etsy-visual-generator.ts`** :

1. **Logo en priorité absolue** : Afficher le `customLogoUrl` en haut et en grand (pas le nom du set)

2. **Pages PDF beaucoup plus grandes** :
   - Taille : 280x396px (ratio A4)
   - Effet cascade de gauche à droite
   - Rotations légères : -12°, -4°, 4°, 12°
   - Ombres portées profondes

3. **Drapeaux centrés sous le logo** (pas en haut à gauche)

4. **Badges plus gros et plus visibles** sur chaque page

5. **Fond amélioré** :
   - Dégradé radial plus riche
   - Suppression de la grille (trop subtile)
   - Effet de lumière central (spotlight)

6. **Bannière CTA en bas** :
   - Fond semi-transparent
   - Texte "✨ Instant Digital Download ✨"
   - Sous-texte optionnel "Placeholders + Checklist"

