# ESDI

An attendance register for Engineering Services and Digital Innovation staff.

## Run locally

Open `index.html` in a modern browser. The app has no build step or external runtime dependencies.

## Login

On the first visit in a browser, create an access password of at least 8 characters. Later visits require that password; signing out ends the current browser session. The password verifier and attendance records are stored in that browser, and clearing the site's browser data resets both.

**Important:** GitHub Pages serves this app as public static files. The login is a browser-side convenience barrier, not server-enforced authentication; it cannot prevent a visitor from accessing the public app or its code. Do not use it to protect confidential attendance data. Real access control requires a private deployment or a backend authentication service.

## Use the register

- Add staff members with their full name and rank in **New staff update**.
- Enter each staff member's time in and time out; record a drawn or typed signature from the signature button.
- Choose a date to view or maintain that day's register. Staff and attendance details save automatically in the browser on this device.
- Select **Submit attendance** to submit a complete day's register. Every listed staff member must have a time in, time out, and signature.
- Select **Export CSV** to download the selected day's attendance table.

Clearing this browser's site data also clears its locally stored staff and attendance records. Export records regularly if they need to be retained or shared.
