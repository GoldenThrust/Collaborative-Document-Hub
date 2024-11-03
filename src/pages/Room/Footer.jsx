import PropTypes from "prop-types"
import ActionTab from "./ActionTab"

export default function Footer({ className }) {
    return <div className={className}>
        <ActionTab className="flex justify-center gap-5 items-center h-full" />
    </div>
}

Footer.propTypes = {
    className: PropTypes.string
}