import NavigationSidebar from "@/components/Navigation";

export default function AuthLayout ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
    return (
        <div className="fixed inset-0 flex w-full overflow-hidden">
            <NavigationSidebar />
            <main className="main-content">
                <div className="container">
                    {children}
                </div>
            </main>
        </div>
    )
}
