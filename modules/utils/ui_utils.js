export function setButtonResourceLoading(btnElement, isLoading, originalText = 'Apply Filters') {
    if (!btnElement) return;
    
    if (isLoading) {
        // Backup the original HTML if we haven't already
        if (btnElement.dataset.originalText === undefined) {
            btnElement.dataset.originalText = btnElement.innerHTML;
        }
        btnElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';
        btnElement.disabled = true;
    } else {
        // Restore the original HTML
        if (btnElement.dataset.originalText !== undefined) {
            btnElement.innerHTML = btnElement.dataset.originalText;
        } else {
            btnElement.innerHTML = originalText;
        }
        btnElement.disabled = false;
    }
}
