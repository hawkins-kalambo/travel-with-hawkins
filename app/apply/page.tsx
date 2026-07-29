import type { Metadata } from "next";
import AmbassadorApplyPage from "../ambassador/apply/page";
import WhatsAppButton from "../components/WhatsAppButton";

export const metadata: Metadata = {
  title: "Apply to Become an Ambassador",
  description: "Apply to join the Travel With Hawkins student ambassador programme in Malawi.",
  alternates: {
    canonical: "/apply",
  },
};

export default function ApplyRoutePage() {
  return (
    <>
      <AmbassadorApplyPage />
      <WhatsAppButton />
    </>
  );
}
