// frontend/src/utils/todoUtils.js

export function getTodoColor(todo) {
    if (todo.completed === 1) return '#f1f5f9';

    if (!todo.due_date) return '#ffffff';

    const now = new Date();
    const due = new Date(todo.due_date);
    const timeLeft = due - now;
    const hoursLeft = timeLeft / (1000 * 60 * 60);

    const durationHours = todo.duration ? Number(todo.duration) / 60 : 0;

    if (timeLeft < 0) return '#fee2e2';

    // Very close deadline
    if (hoursLeft <= 0.5) return '#ffedd5';

    // Not enough time left to comfortably finish the task
    if (durationHours > 0 && hoursLeft <= durationHours) return '#fef3c7';

    // Task should be started soon, but it is not critical yet
    if (durationHours > 0 && hoursLeft <= durationHours + 1) return '#fef9c3';

    // Due today, but still okay
    if (hoursLeft <= 24) return '#ecfdf5';

    // Normal / future task
    return '#f8fafc';
}

export function getTodoUrgencyLabel(todo) {
    if (todo.completed === 1) return 'Completed';

    if (!todo.due_date) return 'No deadline';

    const now = new Date();
    const due = new Date(todo.due_date);
    const timeLeft = due - now;
    const hoursLeft = timeLeft / (1000 * 60 * 60);

    const durationHours = todo.duration ? Number(todo.duration) / 60 : 0;

    if (timeLeft < 0) return 'Overdue';
    if (hoursLeft <= 0.5) return 'Very soon';
    if (durationHours > 0 && hoursLeft <= durationHours) return 'Start now';
    if (durationHours > 0 && hoursLeft <= durationHours + 1) return 'Plan soon';
    if (hoursLeft <= 24) return 'Due today';

    return 'Good';
}

export function formatDurationText(minutes) {
    const totalMinutes = Number(minutes);

    if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
        return '';
    }

    if (totalMinutes < 60) {
        return `${totalMinutes} min`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;

    if (remainingMinutes === 0) {
        return `${hours} h`;
    }

    return `${hours} h ${remainingMinutes} min`;

}

export function getTimeRemainingText(dueDate) {
    if (!dueDate) return '';
    
    const now = new Date();
    const due = new Date(dueDate);
    const diffMs = due - now;
    const diffMins = Math.round(diffMs / 60000);
    const diffHours = Math.round(diffMs / 3600000);
    const diffDays = Math.round(diffMs / 86400000);
    
    if (diffMs < 0) return 'Overdue!';
    if (diffMins < 60) return `${diffMins} min left`;
    if (diffHours < 24) return `${diffHours} hours left`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} left`;
}

export function formatEuropeanDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}