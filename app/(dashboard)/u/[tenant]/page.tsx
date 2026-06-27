import PrimaryButton, { SecondaryButton } from "@/components/Buttons/PrimaryButton";
import MetricCard from "@/components/MetricCard";
import { ChevronDown, Plus } from "lucide-react";

export default function DashboardHome() {
    return (
        <>
            <div className="flex items-end gap-4 justify-between">
                <div className="flex flex-col gap-1">
                    <p className="section-label">Freitag, 26. Juni 2026 · KW 26</p>
                    <h1 className="page-title">
                        <span>Guten Morgen, Frau Brandt</span>
                    </h1>
                </div>
                <div className="flex gap-4 items-center">
                    <PrimaryButton className="flex-1">
                        <Plus size={12} strokeWidth={3} />
                        <p className="">Mitarbeiter einladen</p>
                    </PrimaryButton>
                </div>
            </div>
            <div className="flex gap-4 mt-12">
                <MetricCard
                    className="flex-1"
                    label="Offene Urlaubsanträge"
                    value="8"
                    trend="up"
                    change="3"
                    caption="diese Woche"
                />
                <MetricCard
                    className="flex-1"
                    label="Offene Urlaubsanträge"
                    value="8"
                    trend="up"
                    change="3"
                    caption="diese Woche"
                />
                <MetricCard
                    className="flex-1"
                    label="Offene Urlaubsanträge"
                    value="8"
                    trend="up"
                    change="3"
                    caption="diese Woche"
                />
                <MetricCard
                    className="flex-1"
                    label="Offene Urlaubsanträge"
                    value="8"
                    trend="up"
                    change="3"
                    caption="diese Woche"
                />
            </div>
        </>
    )
}
