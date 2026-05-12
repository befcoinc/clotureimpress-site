# 🖼️ Guide de remplacement des images

## Comment remplacer une image ?

### Méthode simple (3 étapes)

1. **Trouvez l'image à remplacer** dans ce dossier `/images`
2. **Remplacez-la** par votre nouvelle image (même nom de fichier)
3. **Publiez les changements** :
   ```powershell
   git add images/
   git commit -m "Mise à jour des images"
   git push
   ```

Votre site sera automatiquement mis à jour en 30-60 secondes ! ✅

---

## 📋 Liste des images du site

### Services (6 images)
- `service-ornementale.jpg` - Clôture ornementale en fer forgé
- `service-maille.jpg` - Clôture en maille de chaîne
- `service-intimite.jpg` - Clôture d'intimité en bois/PVC
- `service-commercial.jpg` - Clôture commerciale industrielle
- `service-portail.jpg` - Portails et portes cochères
- `service-installation.jpg` - Installation professionnelle

### Galerie (5 images)
- `galerie-montreal.jpg` - Projet à Montréal
- `galerie-laval.jpg` - Projet à Laval
- `galerie-terrebonne.jpg` - Projet à Terrebonne
- `galerie-repentigny.jpg` - Projet à Repentigny
- `galerie-rive-nord.jpg` - Projet Rive-Nord

### Autres
- `hero-background.jpg` - Image de fond de la bannière principale

---

## 📐 Dimensions recommandées

| Type d'image | Largeur | Hauteur | Format |
|--------------|---------|---------|--------|
| Services | 800px | 600px | JPG/PNG |
| Galerie | 800px | 600px | JPG/PNG |
| Hero (fond) | 1920px | 1080px | JPG |
| Logo | Déjà configuré | - | PNG |

---

## ✅ Bonnes pratiques

- **Nommage** : Ne changez PAS les noms de fichiers (remplacez seulement le contenu)
- **Taille** : Gardez les images sous 500 KB pour un chargement rapide
- **Format** : JPG pour les photos, PNG pour les logos/transparence
- **Qualité** : Privilégiez des photos nettes et bien éclairées

---

## 🚀 Après le remplacement

1. Ouvrez PowerShell dans le dossier du projet
2. Tapez ces 3 commandes :
   ```powershell
   git add images/
   git commit -m "Nouvelles photos"
   git push
   ```
3. Attendez 30-60 secondes
4. Rafraîchissez https://clotureimpress.com/ (Ctrl+F5)

C'est tout ! 🎉
