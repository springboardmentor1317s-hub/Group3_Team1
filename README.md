# Angular project

This project was generated using **Angular CLI v21.1.2**.

## Description
A simple Angular application scaffold. This README explains how to set up the project, run it locally, and fix a common issue (`'ng' is not recognized`) that you may encounter on Windows.

---

## Prerequisites
- **Node.js** (LTS recommended) — includes `npm`  
- Optionally: **Angular CLI** installed globally (`npm install -g @angular/cli`)  
  *You can also run CLI commands without global install using `npx`.*

---

## Install dependencies
From the project root run:

```bash
npm install
```
## If ng is not recognized (Windows PowerShell)
If running ng serve yields:
```bash
'ng' is not recognized as the name of a cmdlet, function, script file, or operable program.
```
Fix 1 — install Angular CLI globally:
```bash
npm install -g @angular/cli
```
After global install:
Close and re-open the terminal (or restart your shell) so PATH updates take effect.
Run ng serve again.
Fix 2 — use npx to run local/temporary CLI without global install:
```bash
npx @angular/cli serve
```
If permissions are denied when installing globally on Windows, run PowerShell as Administrator.
## Start development server
```bash
ng serve
```
or with npx:
```bash
npx @angular/cli serve
```
### Notes:

 - On first run the CLI may ask about sharing anonymous usage data (analytics). You can safely choose No.

 - Once running, open: http://localhost:4200/

 - The dev server watches files and reloads on changes.

Terminal hint: press h + Enter to show help while the dev server is running.
## Common issues & quick fixes
ng command not found
 - npm install -g @angular/cli or use npx @angular/cli <command>. Restart the shell after global install.

Missing dependencies / build errors
 - npm install to re-install packages. If errors persist, remove node_modules and package-lock.json and run npm install again:
```bash
rm -rf node_modules package-lock.json
npm install
```
Permission errors on global install (Windows)
 - Run terminal as Administrator.
