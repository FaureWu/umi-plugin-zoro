import { Component } from "react";
import { Provider } from "react-redux";

class Container extends Component {
  render() {
    return (
      <Provider store={window.g_app.start()}>{this.props.children}</Provider>
    );
  }
}

export default Container;
