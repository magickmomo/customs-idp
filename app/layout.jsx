import "../src/styles.css";
import App from "../src/App.jsx";

export const metadata = {
  title: "Customs IDP",
  description: "Intelligent Document Processing for customs operations"
};

export default function RootLayout({ children }) {
  return <html lang="en"><body><App>{children}</App></body></html>;
}
