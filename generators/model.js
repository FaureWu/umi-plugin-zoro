export default {
  state: '<%= name %>',
  setup({ put, select, selectAll }) {

  },
  reducers: {
    update(action, state) {
      return `${state}_<%= name %>`;
    },
  },
  effects: {
    async fetch({ type, payload }, { put, selectAll, select }) {
      
    },
  },
}