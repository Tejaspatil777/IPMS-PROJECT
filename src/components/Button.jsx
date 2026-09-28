export function Button({ children, className, ...props }) {
return (
<button className={`px-6 py-3 rounded-lg font-semibold ${className}`} {...props}>
{children}
</button>
);
}