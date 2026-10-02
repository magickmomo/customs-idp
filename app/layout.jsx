import "../src/styles.css";

export const metadata = {
  title: "Customs IDP",
  description: "Intelligent Document Processing for customs operations"
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
