/**
 * Example: App code using the "form/field" metacard
 *
 * From the app's perspective this is IDENTICAL to using a normal card.
 * The metacard expansion (label + input sub-cards) is invisible to the caller.
 *
 * No init function, no PiRegister argument — importing this file is enough.
 * Both registerCard and registerMetaCard use the same buffered register()
 * mechanism and are replayed once start() runs.
 */

import {registerCard} from "@pihanga2/core";
import type {ReduxState} from "@pihanga2/core";
// Importing this file triggers registerMetaCard() — the "form/field" type
// is buffered and available before our registerCard calls below are replayed.
import {FormField} from "./form-field.metacard";

type AppState = ReduxState & {
  form: {email: string; password: string};
};

// FormField<AppState>({...}) returns a PiCardDef with cardType="form/field".
// When the buffer is flushed, _registerCard sees "form/field" is not in
// cardTypes, finds it in metacardTypes, and calls formFieldMapper to expand
// the full label + input + stack sub-tree automatically.
registerCard(
  "page/login-form",
  FormField<AppState>({
    label: "Email",
    placeholder: "you@example.com",
    value: (s) => s.form.email,
    onChange: (state, {value}) => {
      state.form.email = value;
    },
  }),
);

registerCard(
  "page/password-field",
  FormField<AppState>({
    label: "Password",
    placeholder: "••••••••",
    value: (s) => s.form.password,
    onChange: (state, {value}) => {
      state.form.password = value;
    },
  }),
);
