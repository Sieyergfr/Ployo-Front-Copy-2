import Image from "next/image";

export default function AuthHeader() {
    return (
        <div className="flex flex-col items-center gap-2 mb-8">
            <div className="relative w-10 h-10">
                <Image
                    src="/logo_square_brand.svg"
                    alt="Ployo logo"
                    width={40}
                    height={40}
                    priority
                />
                <div className="w-full h-full absolute left-0 top-0" />
            </div>
            <div className="flex flex-col items-center gap-0.5">
                <p className="text-logo">Ployo</p>
                <p className="eyebrow">PERSONALAKTE</p>
            </div>
        </div>
    )
}
