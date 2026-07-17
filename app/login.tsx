import { Platform } from "react-native";
import { Login } from "@/components/login/Login";
import { TVLogin } from "@/components/login/TVLogin";

const LoginPage: React.FC = () => {
  if (Platform.isTV) {
    return <TVLogin />;
  }

  return <Login />;
};

export default LoginPage;
