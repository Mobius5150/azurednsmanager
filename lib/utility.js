function nullOrBadType(thing, type) {
	return typeof thing !== type || null === thing;
}

module.exports = {
	nullOrBadType: nullOrBadType
};