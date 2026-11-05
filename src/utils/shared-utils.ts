/**
 * Check if an object or array is not empty.
 * @param item The object or array to check for non-emptiness.
 * @returns True if the item is not empty, false otherwise.
 */
export function isNotEmpty(item: any): boolean {
    return !isEmpty(item);
}

/**
 * Check if an object or array is empty.
 * @param item The object or array to check for emptiness.
 * @returns True if the item is empty, false otherwise.
 */
export function isEmpty(item: any) {
    if (item instanceof Array) {
        item = item.filter((val) => !isEmpty(val));
        return item.length === 0;
    } else if (item && typeof item === 'object') {
        for (const key in item) {
            if (
                item[key] === null ||
                item[key] === undefined ||
                item[key] === ''
            ) {
                delete item[key];
            }
        }
        return Object.keys(item).length === 0;
    } else {
        return (
            !item ||
            (item + '').toLocaleLowerCase() === 'null' ||
            (item + '').toLocaleLowerCase() === 'undefined'
        );
    }
}