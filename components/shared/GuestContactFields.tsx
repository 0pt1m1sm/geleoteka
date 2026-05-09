"use client";

import {
  EMAIL_PATTERN,
  EMAIL_TITLE,
  PHONE_PATTERN,
  PHONE_TITLE,
} from "@/lib/utils";

type Field = "name" | "phone" | "email";

interface UncontrolledProps {
  mode: "uncontrolled";
  initialName: string;
  initialPhone: string;
  initialEmail: string;
  onDraftChange: (field: Field, value: string) => void;
}

interface ControlledProps {
  mode: "controlled";
  name: string;
  phone: string;
  email: string;
  onChange: (field: Field, value: string) => void;
}

type GuestContactFieldsProps = UncontrolledProps | ControlledProps;

/**
 * The Имя/Телефон/Email triplet collected from guests at every checkout
 * (rental, parts cart, service booking). One source of truth for the
 * pattern, autoComplete, and field labels — keep these aligned with
 * findOrCreateGuestCustomer + isValidRussianPhone.
 *
 * Two modes:
 *  - "uncontrolled" — defaultValue + onDraftChange. Use with FormData
 *    submission (rentals, parts).
 *  - "controlled" — value + onChange. Use when parent owns state
 *    (booking wizard via BookingProvider).
 */
export function GuestContactFields(props: GuestContactFieldsProps): React.ReactElement {
  const isControlled = props.mode === "controlled";

  const nameProps = isControlled
    ? { value: props.name, onChange: (e: React.ChangeEvent<HTMLInputElement>) => props.onChange("name", e.target.value) }
    : {
        defaultValue: props.initialName,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => props.onDraftChange("name", e.target.value),
      };
  const phoneProps = isControlled
    ? { value: props.phone, onChange: (e: React.ChangeEvent<HTMLInputElement>) => props.onChange("phone", e.target.value) }
    : {
        defaultValue: props.initialPhone,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => props.onDraftChange("phone", e.target.value),
      };
  const emailProps = isControlled
    ? { value: props.email, onChange: (e: React.ChangeEvent<HTMLInputElement>) => props.onChange("email", e.target.value) }
    : {
        defaultValue: props.initialEmail,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => props.onDraftChange("email", e.target.value),
      };

  return (
    <>
      <div>
        <label htmlFor="name" className="block text-sm font-medium mb-2">Имя *</label>
        <input
          id="name"
          name="name"
          type="text"
          required
          minLength={2}
          maxLength={120}
          autoComplete="name"
          className="input"
          placeholder="Иван Иванов"
          {...nameProps}
        />
      </div>
      <div>
        <label htmlFor="phone" className="block text-sm font-medium mb-2">Телефон *</label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          pattern={PHONE_PATTERN}
          title={PHONE_TITLE}
          className="input"
          placeholder="+79991234567"
          {...phoneProps}
        />
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-2">Email *</label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          pattern={EMAIL_PATTERN}
          title={EMAIL_TITLE}
          className="input"
          placeholder="your@email.com"
          {...emailProps}
        />
      </div>
    </>
  );
}
