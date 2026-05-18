import React from 'react';

interface MobileActionScrollProps {
    children: React.ReactNode;
    className?: string;
}

const MobileActionScroll: React.FC<MobileActionScrollProps> = ({ children, className = '' }) => {
    return (
        <div className={`
            flex w-full max-w-full flex-row gap-3 overflow-x-auto scrollbar-hide py-2 px-1 items-center snap-x
            [&>*]:shrink-0
            md:flex-wrap md:overflow-visible md:p-0
            ${className}
        `}>
            {children}
        </div>
    );
};

export default MobileActionScroll;
