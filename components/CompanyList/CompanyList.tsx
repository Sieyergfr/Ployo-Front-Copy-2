import { ReactNode } from "react";

type Props = {
  children: ReactNode;
}

export default function CompanyList({ children }: Props) {
    return (
        <div className="list-wrapper mt-4">
            { children }
        </div>
    )
}