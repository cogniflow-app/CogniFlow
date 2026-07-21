import "../phase-two.css";
import "../product-redesign.css";

import type { ReactNode } from "react";

import { productSans } from "../product-font";

export default function PublicDeckLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <div className={productSans.variable}>{children}</div>;
}
