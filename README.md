# ESDI

An attendance register for Engineering Services and Digital Innovation staff.

## Run locally

Serve the repository root with any local web server (for example, `python -m http.server 4173`) and open `http://localhost:4173`. The app uses Firebase's browser SDK from Google's CDN.

## Login

Create an account with an email address and password, verify the email, then sign in. An administrator must approve the email address before it can access attendance data. Use the same approved account on each device. Use **Forgot password?** to request a reset link. Firebase Authentication manages accounts and sessions; passwords are never stored in the app.

The Firebase project is `attendance-register-88830`. Authentication uses verified email/password accounts and Cloud Firestore stores the shared roster and dated attendance entries in the `africa-south1` region. `firestore.rules` restricts data access to verified accounts whose lowercase email has an `approvedUsers/{email}` document. Only project administrators can manage this collection through the Firebase Console; client-side writes are denied. To approve an account, create a document in `approvedUsers` whose document ID is the lowercase email address, for example `user@example.com`. To revoke access, delete that document. The account must also exist in Firebase Authentication and have a verified email. The GitHub Pages hostname must remain listed in Firebase Authentication's authorized domains.

The initial approved address is `plscommand@gmail.com`. New accounts are not approved automatically and cannot access the register until an administrator adds them to `approvedUsers`.

## Use the register

- Add staff members with their full name and rank in **New staff update**.
- Enter each staff member's time in and time out; record a drawn or typed signature from the signature button.
- Choose a date to view or maintain that day's register. Changes sync to Firestore and appear on other signed-in devices. On sign-in, the most recent unsubmitted date is selected when one exists.
- Select **Submit attendance** to submit a complete day's register. Every listed staff member must have a time in, time out, and signature.
- Select **Export CSV** to download the selected day's attendance table.

The browser keeps a local cache for faster display and can import legacy local records into Firestore when the shared roster is empty. Export records regularly if you need an additional backup.

## Firebase deployment

The Firebase CLI project alias is stored in `.firebaserc`. Deploy Firestore rules with `npx firebase-tools deploy --only firestore:rules --project attendance-register-88830`. The app itself is published through GitHub Pages from the `pnet2log-esdi-attendance-register` branch.
