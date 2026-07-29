import type { Metadata } from "next";
import Home from "../page";

export const metadata: Metadata = {
  title: "Book Student Transport",
  description: "Book a scheduled route or request a custom student transport trip with Travel With Hawkins.",
  alternates: {
    canonical: "/book",
  },
};

export default function BookPage() {
  return <Home />;
}
