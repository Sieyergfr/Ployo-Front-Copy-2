import AuthHeader from "@/components/AuthHeader";
import AuthSegmented from "@/components/AuthSegmented";
import Card from "@/components/Card/card";
import NavigationSidebar from "@/components/Navigation";

export default function AuthLayout ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
    return (
        <div className="min-h-svh w-full flex">
            <NavigationSidebar />
            <main className="main-content">
                <div className="container">
                    {children}
                </div>
            </main>
        </div>
    )
}