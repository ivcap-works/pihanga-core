// @ts-nocheck — documentation example only; @pihanga2/shadcn is not a dep of pihanga-core
/**
 * Example: A "form/field" metacard
 *
 * A metacard is a card *type* that expands into several real cards at
 * registration time.  App code uses it exactly like a normal card, but the
 * mapper function assembles a whole sub-tree behind the scenes.
 *
 * Compare with a plain registerCard call:
 *
 *   // Normal card — 1 name → 1 known component
 *   register.card("page/title", Typography<AppState>({ text: "Hello" }))
 *
 *   // Metacard — 1 name → mapper generates N sub-cards + 1 top card
 *   register.card("page/email", FormField<AppState>({ label: "Email", ... }))
 *     └─ mapper creates:
 *          "page/email/label"  → shadcn/typography
 *          "page/email/input"  → shadcn/input
 *          "page/email"        → shadcn/stack  (returned as the top card)
 */

import {createCardDeclaration, registerMetaCard} from "@pihanga2/core";
import type {
  PiCardDef,
  PiRegisterMetaCard,
  RegisterCardF,
} from "@pihanga2/core";
// Import card declaration helpers from the card library — these return a
// PiCardDef with the correct cardType baked in, so you never hardcode strings.
import {Input, Stack, Typography} from "@pihanga2/shadcn";

// ---------------------------------------------------------------------------
// 1. Surface props — what app code passes when using FormField<AppState>({})
// ---------------------------------------------------------------------------
type FormFieldProps = {
  label: string;
  placeholder?: string;
  value: string;
};
type FormFieldEvents = {
  onChange: {value: string};
};

/**
 * App-facing declaration helper — identical to any normal card.
 * Usage:  register.card("my/field", FormField<AppState>({ ... }))
 */
export const FormField = createCardDeclaration<FormFieldProps, FormFieldEvents>(
  "form/field",
);

// ---------------------------------------------------------------------------
// 2. The mapper
//    Called by _registerMetadataCard when a card with cardType="form/field"
//    is registered and "form/field" is NOT in the component (cardTypes) registry.
//
//    Signature (MetaCardMapperF): (name, props, registerCard) => PiCardDef
//      name         – card name chosen by the app, e.g. "page/email"
//      props        – the full FormFieldProps + event handlers
//      registerCard – use this to register sub-cards under derived names
//
//    Why does MetaCardMapperF use `props: any`?
//    MetaCard.mapper is stored in a plain dict (metacardTypes) that holds
//    mappers for ALL metacard types — each with a different props shape.
//    There's no way to keep the generic <P> alive in a uniform dictionary
//    entry, so the stored type is erased to `any`.
//
//    In your concrete function you CAN narrow `props` — TypeScript allows
//    assigning `(props: Specific) => ...` to `MetaCardMapperF` because `any`
//    is bi-directional (it suppresses both covariant and contravariant checks).
//    Use `PiCardDef & FormFieldProps` to get the `cardType` field plus your
//    own typed props.
// ---------------------------------------------------------------------------

// Concrete props type: static values + event handlers forwarded from app code.
// Note: state mappers ((s: S) => T) are also valid values for each prop because
// `PiMapProps` allows them — so treat every value as potentially a function.
type FormFieldMapperProps = PiCardDef &
  FormFieldProps & {
    onChange?: (ev: {value: string}) => void;
  };

function formFieldMapper(
  name: string,
  props: FormFieldMapperProps, // narrowed from MetaCardMapperF's erased `any`
  registerCard: RegisterCardF,
): PiCardDef {
  // Use card declaration helpers instead of raw {cardType: "..."} objects.
  // Typography({...}) returns { cardType: "shadcn/typography", text: ... }
  // — identical to the raw form but type-checked and refactor-safe.
  registerCard(`${name}/label`, Typography({text: props.label}));

  // Input({...}) returns { cardType: "shadcn/input", ... }
  registerCard(
    `${name}/input`,
    Input({
      placeholder: props.placeholder ?? "",
      value: props.value,
      onChange: props.onChange,
    }),
  );

  // Stack({...}) returns { cardType: "shadcn/stack", ... }
  return Stack({
    direction: "vertical",
    content: [`${name}/label`, `${name}/input`],
  });
}

// ---------------------------------------------------------------------------
// 3. Register the metacard type at module-load time.
//    registerMetaCard buffers the call (like registerCardComponent)
//    and replays it once start() has wired up PiRegister.
//    No init() function or explicit register argument needed — importing this
//    file is sufficient.
// ---------------------------------------------------------------------------
registerMetaCard({
  type: "form/field", // must match the cardType string above
  mapper: formFieldMapper,
  events: {onChange: "form/field/change"}, // event name → Redux action type
} satisfies PiRegisterMetaCard);
