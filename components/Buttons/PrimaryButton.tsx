import { ButtonHTMLAttributes } from "react";
import { LucideIcon } from "lucide-react";

type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    Icon?: LucideIcon;
};

export default function PrimaryButton({
    children,
    Icon,
    className,
    ...props
}: PrimaryButtonProps) {
    return (
        <button
            {...props}
            className={`btn btn-block btn-primary flex items-center justify-center gap-2 ${className}`}
        >
            {children}
            {Icon && <Icon className="h-4 w-4" />}
        </button>
    );
}

export function SecondaryButton({
    children,
    Icon,
    className,
    ...props
}: PrimaryButtonProps) {
    return (
        <button
            {...props}
            className={`btn btn-block btn-secondary flex items-center justify-center gap-2 ${className}`}
        >
            {children}
            {Icon && <Icon className="h-4 w-4" />}
        </button>
    );
}