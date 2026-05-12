# 🖼️ GUIDE RAPIDE - Remplacer les images

## Méthode Super Simple (5 minutes)

### Étape 1 : Préparez vos images

Créez un dossier sur votre Bureau nommé `mes-photos-clotures` et mettez-y vos photos avec ces noms EXACTS :

```
service-ornementale.jpg
service-maille.jpg  
service-intimite.jpg
service-commercial.jpg
service-portail.jpg
service-installation.jpg
galerie-1.jpg
galerie-2.jpg
galerie-3.jpg
galerie-4.jpg
galerie-5.jpg
hero-background.jpg
```

**💡 IMPORTANT** : Les noms doivent être EXACTEMENT comme ci-dessus (minuscules, avec tirets).

---

### Étape 2 : Copiez les images dans le projet

1. Ouvrez l'explorateur Windows
2. Allez dans : `C:\Users\math6\Documents\GitHub\clotureimpress-site\`
3. Créez un dossier nommé `images` (s'il n'existe pas déjà)
4. **Glissez-déposez** toutes vos photos du Bureau vers ce dossier `images`

---

### Étape 3 : Publiez les changements

1. Ouvrez **PowerShell** 
2. Allez dans le bon dossier avec cette commande :

cd C:\Users\math6\Documents\GitHub\clotureimpress-site

3. Ensuite, copiez-collez ces 3 commandes **UNE PAR UNE** (sans les backticks ``` !) :

git add images/

git commit -m "Ajout de nouvelles photos"

git push

4. Attendez 30-60 secondes ⏱️
5. Allez sur https://clotureimpress.com/ et appuyez sur **Ctrl + F5** pour rafraîchir

**C'EST TOUT ! ✅** Vos images sont en ligne !

---

## 📐 Tailles recommandées

- **Services / Galerie** : 800px × 600px (JPG)
- **Hero (fond)** : 1920px × 1080px (JPG)
- **Poids max** : 500 KB par image

---

## ❓ En cas de problème

Si une image ne s'affiche pas :
1. Vérifiez que le nom du fichier est EXACTEMENT comme indiqué
2. Vérifiez que le format est JPG ou PNG (pas JPEG)
3. Vérifiez que l'image est bien dans le dossier `images/`
4. Attendez 2-3 minutes et rafraîchissez avec Ctrl + F5

---

## 🔄 Pour remplacer une image plus tard

Répétez simplement les Étapes 2 et 3 : glissez la nouvelle image (même nom) et faites `git add`, `commit`, `push`.

---

**Besoin d'aide ?** Contactez-moi avec ce fichier et je vous guiderai ! 🚀
