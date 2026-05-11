import { getCMSMany, getCMSRichtext } from "@/lib/cms";

export interface Requisites {
  legalName: string;
  shortName: string;
  inn: string;
  kpp: string;
  ogrn: string;
  legalAddress: string;
  bankName: string;
  bankBik: string;
  account: string;
  corrAccount: string;
  directorName: string;
  estimateFooter: string;
  warranty: string;
  paymentTerms: string;
  contactPhone: string;
  contactEmail: string;
  contactAddress: string;
}

/**
 * Load org requisites + public contacts from CMS for the estimate
 * print view. All fields are optional — missing ones render as empty
 * lines in the print template and the corresponding block hides.
 */
export async function loadRequisites(): Promise<Requisites> {
  const [base, footer, warranty, paymentTerms] = await Promise.all([
    getCMSMany([
      "requisites.legal_name",
      "requisites.short_name",
      "requisites.inn",
      "requisites.kpp",
      "requisites.ogrn",
      "requisites.legal_address",
      "requisites.bank_name",
      "requisites.bank_bik",
      "requisites.account",
      "requisites.corr_account",
      "requisites.director_name",
      "contacts.phone.service",
      "contacts.email",
      "contacts.address",
    ]),
    getCMSRichtext("requisites.estimate_footer"),
    getCMSRichtext("requisites.warranty"),
    getCMSRichtext("requisites.payment_terms"),
  ]);

  return {
    legalName: base["requisites.legal_name"] ?? "",
    shortName: base["requisites.short_name"] ?? "Geleoteka",
    inn: base["requisites.inn"] ?? "",
    kpp: base["requisites.kpp"] ?? "",
    ogrn: base["requisites.ogrn"] ?? "",
    legalAddress: base["requisites.legal_address"] ?? "",
    bankName: base["requisites.bank_name"] ?? "",
    bankBik: base["requisites.bank_bik"] ?? "",
    account: base["requisites.account"] ?? "",
    corrAccount: base["requisites.corr_account"] ?? "",
    directorName: base["requisites.director_name"] ?? "",
    estimateFooter: footer,
    warranty,
    paymentTerms,
    contactPhone: base["contacts.phone.service"] ?? "",
    contactEmail: base["contacts.email"] ?? "",
    contactAddress: base["contacts.address"] ?? "",
  };
}
